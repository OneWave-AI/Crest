import SwiftUI

/// The workspace remains visible beside chat on iPad and resizes with Split View.
struct WorkspaceSidebar: View {
    @Bindable var store: ChatStore
    @State private var files: [String] = []
    @State private var loading = false
    @State private var error: String?
    @State private var query = ""

    var body: some View {
        List {
            Section("Laptop") {
                Button { store.sheet = .connection } label: {
                    Label(store.laptop?.laptopName ?? "Connect your laptop", systemImage: "laptopcomputer")
                }
                Label(store.online ? "Connected · Local Qwen" : "Offline", systemImage: store.online ? "checkmark.shield" : "wifi.slash")
                    .font(.caption).foregroundStyle(store.online ? .mint : .secondary)
            }
            Section("Projects") {
                ForEach(store.projects) { project in
                    Button {
                        store.projectId = project.id
                        store.selectedFiles = []
                        store.saveChoices()
                    } label: {
                        HStack {
                            Label(project.name, systemImage: "folder")
                            Spacer()
                            if project.id == store.projectId { Image(systemName: "checkmark").foregroundStyle(.mint) }
                        }
                    }.disabled(store.working)
                }
                if store.projects.isEmpty { Text("Approve a project in Crest on your Mac.").font(.caption).foregroundStyle(.secondary) }
            }
            Section("Files · \(store.selectedFiles.count)/20 selected") {
                Button { store.sheet = .files } label: { Label("Manage files / create file", systemImage: "doc.badge.plus") }
                    .disabled(store.working || store.projectId.isEmpty)
                if loading { ProgressView("Loading files…") }
                if let error { Text(error).font(.caption).foregroundStyle(.orange) }
                ForEach(files.filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query) }, id: \.self) { path in
                    Button {
                        if store.selectedFiles.contains(path) { store.selectedFiles.remove(path) }
                        else if store.selectedFiles.count < 20 { store.selectedFiles.insert(path) }
                        store.saveChoices()
                    } label: {
                        HStack {
                            Image(systemName: store.selectedFiles.contains(path) ? "checkmark.circle.fill" : "doc.text")
                            Text(path).font(.caption.monospaced()).lineLimit(2)
                        }.foregroundStyle(store.selectedFiles.contains(path) ? .mint : .primary)
                    }.disabled(store.working || (!store.selectedFiles.contains(path) && store.selectedFiles.count >= 20))
                }
            }
        }
        .listStyle(.sidebar)
        .searchable(text: $query, prompt: "Find a source file")
        .navigationTitle("Workspace")
        .task(id: "\(store.projectId):\(store.online):\(store.working)") {
            files = []; error = nil
            guard store.online, !store.projectId.isEmpty else { return }
            loading = true
            defer { loading = false }
            do {
                let result = try await store.files()
                try Task.checkCancellation()
                files = result
            } catch is CancellationError { } catch { self.error = error.localizedDescription }
        }
    }
}
