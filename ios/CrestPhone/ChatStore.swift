import Foundation
import Observation

enum HarnessSheet: String, Identifiable { case connection, files; var id: String { rawValue } }

struct ChatMessage: Codable, Identifiable {
    var id = UUID()
    let role: String
    let text: String
    var changedFiles: [String] = []
    var failed = false
}
private struct Conversation: Codable {
    let deviceId: String
    var messages: [ChatMessage]
    var pending: CodingRequest?
    var jobId: String?
    var projectId: String
    var model: String
    var files: [String]
    var mode: String
}

@MainActor @Observable
final class ChatStore {
    var laptop: PairedLaptop?
    var messages: [ChatMessage] = []
    var draft = ""
    var projects: [LaptopProject] = []
    var models: [LaptopModel] = []
    var projectId = ""
    var model = "qwen3.5:4b"
    var selectedFiles: Set<String> = []
    var mode = "review"
    var online = false
    var working = false
    var error: String?
    var sheet: HarnessSheet?
    var pairingLink = ""
    var pairing = false
    private(set) var pending: CodingRequest?
    private(set) var jobId: String?
    @ObservationIgnored private var client: LaptopClient?
    @ObservationIgnored private var poller: Task<Void, Never>?
    @ObservationIgnored private var pollerGeneration: UUID?
    @ObservationIgnored private var refreshing = false
    @ObservationIgnored private let historyURL: URL

    init() {
        historyURL = URL.applicationSupportDirectory.appendingPathComponent("conversation.json")
        laptop = PairingKeychain.load()
        if let laptop {
            client = LaptopClient(laptop)
            if let data = try? Data(contentsOf: historyURL), let history = try? JSONDecoder().decode(Conversation.self, from: data), history.deviceId == laptop.deviceId {
                messages = history.messages; pending = history.pending; jobId = history.jobId
                projectId = history.projectId; model = history.model; selectedFiles = Set(history.files); mode = history.mode
                working = pending != nil || jobId != nil
            }
        }
    }
    var projectName: String { projects.first(where: { $0.id == projectId })?.name ?? "Choose project" }
    private func persist() {
        guard let laptop else { return }
        do {
            try FileManager.default.createDirectory(at: historyURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            let snapshot = Conversation(deviceId: laptop.deviceId, messages: messages, pending: pending, jobId: jobId,
                projectId: projectId, model: model, files: selectedFiles.sorted(), mode: mode)
            try JSONEncoder().encode(snapshot).write(to: historyURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch { self.error = "Couldn't save this conversation on your phone." }
    }
    func pair(_ raw: String) async {
        guard !pairing else { return }; pairing = true; error = nil
        defer { pairing = false }
        do {
            let link = try PairingLink(raw)
            let response = try await LaptopClient(url: link.url, fingerprint: link.fingerprint).pair(code: link.code)
            let paired = PairedLaptop(url: link.url, fingerprint: link.fingerprint, token: response.token, deviceId: response.deviceId, laptopName: response.laptopName)
            try PairingKeychain.save(paired)
            pausePolling(); laptop = paired; client = LaptopClient(paired)
            messages = []; pending = nil; jobId = nil; working = false; selectedFiles = []; projectId = ""
            mode = "review"; model = "qwen3.5:4b"
            pairingLink = ""; sheet = nil; persist()
            await refresh()
        } catch { self.error = error.localizedDescription }
    }
    func disconnect() {
        pausePolling(); PairingKeychain.clear(); laptop = nil; client = nil; online = false
        messages = []; pending = nil; jobId = nil; working = false; selectedFiles = []
        try? FileManager.default.removeItem(at: historyURL)
    }
    func refresh() async {
        guard let client, !refreshing else { return }; refreshing = true
        defer { refreshing = false }
        do {
            let _: LaptopStatus = try await client.request("v1/status")
            async let availableProjects: [LaptopProject] = client.request("v1/projects")
            async let availableModels: LaptopModels = client.request("v1/models")
            let (p, m) = try await (availableProjects, availableModels)
            projects = p; models = m.models.filter { !$0.embeddingOnly }; online = true; error = nil
            if !projects.contains(where: { $0.id == projectId }) { projectId = projects.first?.id ?? ""; selectedFiles = [] }
            if !models.contains(where: { $0.name == model }) { model = models.first?.name ?? "qwen3.5:4b" }
            if working && poller == nil { startPolling() }
            persist()
        } catch is CancellationError {} catch { online = false; self.error = "Can't reach your laptop. Keep Crest open and use the same Wi-Fi. \(error.localizedDescription)" }
    }
    func files() async throws -> [String] {
        guard let client, !projectId.isEmpty else { return [] }
        let list: FileList = try await client.request("v1/projects/\(projectId)/files")
        return list.files
    }
    func saveChoices() { persist() }
    func send() {
        guard let client, online, !working, !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, !projectId.isEmpty else { return }
        guard draft.count <= 6000 else { error = "Split this message into less than 6,000 characters."; return }
        guard mode != "edit" || !selectedFiles.isEmpty else { error = "Choose the files to edit, or add a new file path."; return }
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        let history = messages.filter { !$0.failed }.suffix(6).map { ChatTurn(role: $0.role, content: String($0.text.prefix(2000))) }
        messages.append(ChatMessage(role: "user", text: text)); draft = ""; error = nil
        pending = CodingRequest(projectId: projectId, prompt: text, files: selectedFiles.sorted(), mode: mode, model: model, requestKey: UUID().uuidString.lowercased(), history: history.isEmpty ? nil : history)
        working = true; persist()
        _ = client
        startPolling()
    }
    func retry() { error = nil; startPolling() }
    func pausePolling() { pollerGeneration = nil; poller?.cancel(); poller = nil }
    private func startPolling() {
        guard poller == nil, let client, working else { return }
        let generation = UUID(); pollerGeneration = generation
        poller = Task { [weak self] in
            guard let self else { return }
            defer { if self.pollerGeneration == generation { self.poller = nil; self.pollerGeneration = nil } }
            do {
                if self.jobId == nil, let request = self.pending {
                    let job = try await client.start(request)
                    guard self.pollerGeneration == generation, !Task.isCancelled else { return }
                    self.jobId = job.id; self.persist()
                }
                guard let id = self.jobId else { return }
                while !Task.isCancelled {
                    let job = try await client.job(id)
                    guard self.pollerGeneration == generation, !Task.isCancelled else { return }
                    if job.status != "running" {
                        let failed = job.status != "completed"
                        var text = job.summary ?? job.error ?? (job.status == "cancelled" ? "Stopped on your laptop." : "Finished.")
                        // Small models can echo an old summary even after a valid write.
                        // In that case report the independently verified write result.
                        if !job.changedFiles.isEmpty && self.messages.contains(where: { $0.role == "assistant" && $0.text == text }) {
                            text = "Updated \(job.changedFiles.count == 1 ? "1 file" : "\(job.changedFiles.count) files") on your laptop. The original contents are backed up on your Mac."
                        }
                        self.messages.append(ChatMessage(role: "assistant", text: text, changedFiles: job.changedFiles, failed: failed))
                        self.pending = nil; self.jobId = nil; self.working = false; self.error = nil; self.persist(); return
                    }
                    try await Task.sleep(for: .seconds(2))
                }
            } catch is CancellationError {} catch let e as URLError where e.code == .cancelled {} catch {
                self.error = error.localizedDescription
                if self.jobId == nil, case HarnessError.response(let status, _) = error, (400...499).contains(status) {
                    self.pending = nil; self.working = false; self.persist()
                }
            }
        }
    }
    func stop() async {
        guard let client else { return }
        do {
            // If the start response was lost, recover its handle using the same key first.
            if jobId == nil, let pending { jobId = try await client.start(pending).id; persist() }
            guard let jobId else { return }
            _ = try await client.cancel(jobId)
            if poller == nil { startPolling() }
        } catch { self.error = error.localizedDescription }
    }
    func newChat() { guard !working else { return }; messages = []; error = nil; persist() }
}
