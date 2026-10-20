import SwiftUI

private let ink = Color(red: 0.055, green: 0.065, blue: 0.08)
private let panel = Color(red: 0.085, green: 0.10, blue: 0.12)
private let accent = Color(red: 0.56, green: 0.90, blue: 0.75)

struct IPadWorkspace: View {
    @Bindable var store: ChatStore
    @State private var files: [String] = []
    @State private var query = ""
    @State private var previewPath: String?
    @State private var content = ""
    @State private var previewError: String?
    @State private var filesError: String?
    @State private var loadingPreview = false
    @State private var showSidebar = true
    @FocusState private var typing: Bool

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                if showSidebar {
                    sidebar.frame(width: 250)
                    Divider()
                }
                VStack(spacing: 0) {
                    header
                    Divider()
                    HStack(spacing: 0) {
                        VStack(spacing: 0) {
                            conversation
                            if let error = store.error {
                                HStack {
                                    Label(error, systemImage: "exclamationmark.circle").font(.caption).foregroundStyle(.orange)
                                    Spacer()
                                    Button("Reconnect") { Task { await store.refresh(); store.retry() } }
                                }.padding(16)
                            }
                            composer
                        }.frame(maxWidth: .infinity)
                        if previewPath != nil && geometry.size.width > 1050 {
                            Divider()
                            preview.frame(width: min(420, geometry.size.width * 0.34))
                        }
                    }
                }.frame(maxWidth: .infinity)
            }.background(ink)
            .sheet(isPresented: Binding(get: { previewPath != nil && geometry.size.width <= 1050 }, set: { if !$0 { previewPath = nil } })) {
                preview.presentationDetents([.large])
            }
        }
        .sheet(item: $store.sheet) { sheet in
            switch sheet {
            case .connection: ConnectionView(store: store)
            case .files: FilesView(store: store)
            }
        }
        .task(id: "\(store.projectId):\(store.online):\(store.working)") {
            filesError = nil
            guard store.online else { files = []; return }
            do { let result = try await store.files(); try Task.checkCancellation(); files = result }
            catch is CancellationError {} catch { filesError = error.localizedDescription }
        }
        .onChange(of: store.projectId) { _, _ in previewPath = nil; files = [] }
        .task(id: previewPath) {
            content = ""; previewError = nil
            guard let path = previewPath else { return }
            loadingPreview = true
            defer { loadingPreview = false }
            do {
                let result = try await store.preview(path)
                try Task.checkCancellation()
                content = result.content
            } catch is CancellationError {} catch { previewError = error.localizedDescription }
        }
    }

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "chevron.left.forwardslash.chevron.right").font(.title3.bold()).foregroundStyle(accent)
                Text("crest").font(.system(size: 27, weight: .semibold, design: .rounded)).tracking(-1)
                Spacer()
                Text("LOCAL").font(.system(size: 9, weight: .bold)).tracking(1).padding(6).background(accent.opacity(0.12), in: Capsule()).foregroundStyle(accent)
            }.padding(22)
            Button { store.newChat() } label: {
                HStack { Image(systemName: "square.and.pencil"); Text("New conversation"); Spacer(); Text("⌘N").foregroundStyle(.secondary) }
                    .font(.subheadline.weight(.medium)).padding(13).background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
            }.buttonStyle(.plain).padding(.horizontal, 16).disabled(store.working).keyboardShortcut("n")
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 8) {
                        sectionTitle("PROJECTS")
                        ForEach(store.projects) { project in
                            Button {
                                store.projectId = project.id; store.selectedFiles = []; store.saveChoices()
                            } label: {
                                HStack {
                                    Image(systemName: "folder.fill").foregroundStyle(project.id == store.projectId ? accent : .secondary)
                                    Text(project.name).lineLimit(1)
                                    Spacer()
                                    if project.id == store.projectId { Circle().fill(accent).frame(width: 5, height: 5) }
                                }.font(.subheadline).padding(12).background(project.id == store.projectId ? accent.opacity(0.09) : .clear, in: RoundedRectangle(cornerRadius: 10))
                            }.buttonStyle(.plain).disabled(store.working)
                        }
                        if store.projects.isEmpty { Text("Approve a project in Crest on your Mac.").font(.caption).foregroundStyle(.secondary) }
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        HStack { sectionTitle("EXPLORER"); Spacer(); Button { store.sheet = .files } label: { Image(systemName: "plus") }.accessibilityLabel("Manage files") }
                        HStack { Image(systemName: "magnifyingglass"); TextField("Find a file", text: $query).textInputAutocapitalization(.never).autocorrectionDisabled() }
                            .font(.caption).foregroundStyle(.secondary).padding(10).background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 8))
                        if let filesError { Text(filesError).font(.caption).foregroundStyle(.orange) }
                        ForEach(files.filter { query.isEmpty || $0.localizedCaseInsensitiveContains(query) }, id: \.self) { file in
                            HStack(spacing: 8) {
                                Button { previewPath = file } label: {
                                    HStack(spacing: 9) {
                                        Image(systemName: "doc.text").foregroundStyle(accent.opacity(0.7))
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(URL(fileURLWithPath: file).lastPathComponent).lineLimit(1)
                                            if file.contains("/") { Text(file).font(.system(size: 10)).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle) }
                                        }
                                        Spacer(minLength: 0)
                                    }.padding(.vertical, 8)
                                }.buttonStyle(.plain).accessibilityLabel("Preview \(file)")
                                Button { toggle(file) } label: {
                                    Image(systemName: store.selectedFiles.contains(file) ? "checkmark.circle.fill" : "circle.dashed")
                                        .foregroundStyle(store.selectedFiles.contains(file) ? accent : .secondary).frame(width: 30, height: 34)
                                }.buttonStyle(.plain).disabled(store.working).accessibilityLabel("Toggle context for \(file)")
                            }.font(.caption).padding(.horizontal, 8).background(previewPath == file ? .white.opacity(0.06) : .clear, in: RoundedRectangle(cornerRadius: 8))
                        }
                        if files.isEmpty && filesError == nil { Text("Your project files appear here. Use + to create a new file.").font(.caption).foregroundStyle(.secondary) }
                    }
                }.padding(16)
            }
            Divider()
            Button { store.sheet = .connection } label: {
                HStack(spacing: 10) {
                    Image(systemName: "laptopcomputer").font(.title3)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(store.laptop?.laptopName ?? "Connect your Mac").font(.caption.weight(.medium)).lineLimit(1)
                        HStack(spacing: 5) { Circle().fill(store.online ? accent : .orange).frame(width: 5, height: 5); Text(store.online ? "Connected over Wi-Fi" : "Connection settings").font(.system(size: 10)).foregroundStyle(.secondary) }
                    }
                    Spacer(); Image(systemName: "gearshape").foregroundStyle(.secondary)
                }.padding(18)
            }.buttonStyle(.plain)
        }.background(panel.opacity(0.65))
    }

    private var header: some View {
        HStack(spacing: 14) {
            Button { withAnimation { showSidebar.toggle() } } label: { Image(systemName: "sidebar.left") }.accessibilityLabel("Toggle workspace sidebar")
            Divider().frame(height: 18)
            VStack(alignment: .leading, spacing: 3) {
                Text(store.projectName).font(.subheadline.weight(.semibold))
                Text(store.working ? "Task running on your Mac" : "Coding workspace").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Menu { ForEach(store.models) { model in Button(model.name) { store.model = model.name; store.saveChoices() } } } label: {
                HStack(spacing: 6) { Image(systemName: "cpu").foregroundStyle(accent); Text(store.model); Image(systemName: "chevron.down").font(.caption2) }.font(.caption).padding(10).background(.white.opacity(0.04), in: Capsule())
            }.disabled(store.working)
        }.buttonStyle(.plain).padding(.horizontal, 22).frame(height: 72)
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if store.messages.isEmpty { emptyState.padding(.top, 50) }
                    ForEach(store.messages) { message in
                        MessageRow(message: message).padding(20).background(message.role == "user" ? panel : .clear, in: RoundedRectangle(cornerRadius: 16))
                    }
                    if store.working {
                        HStack(spacing: 12) { ProgressView(); VStack(alignment: .leading, spacing: 5) { Text("Working on your Mac").font(.subheadline.weight(.medium)); Text("You can browse files while Qwen works.").font(.caption).foregroundStyle(.secondary) } }.padding(20)
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }.padding(28).frame(maxWidth: 860).frame(maxWidth: .infinity)
            }.scrollDismissesKeyboard(.interactively)
            .onChange(of: store.messages.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            .onChange(of: store.working) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 24) {
            Image(systemName: "sparkle").font(.system(size: 34, weight: .light)).foregroundStyle(accent)
            VStack(alignment: .leading, spacing: 12) {
                Text("Make something\nworth shipping.").font(.system(size: 38, weight: .semibold, design: .rounded)).tracking(-1)
                Text("Your ideas. Your code. Your Mac.\nPick a starting point, or tell Qwen what you have in mind.").foregroundStyle(.secondary).lineSpacing(5)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 190))], spacing: 12) {
                suggestion("Build something", "Turn an idea into working code", "hammer", "Help me plan and build a new feature in this project.")
                suggestion("Understand code", "Get a clear walkthrough", "text.magnifyingglass", "Explain the selected files and how they fit together.")
                suggestion("Review & improve", "Find bugs and sharpen the details", "checkmark.shield", "Review the selected files for bugs and suggest concrete improvements.")
            }
            Label("Local inference · No cloud model key", systemImage: "lock.shield").font(.caption).foregroundStyle(.secondary)
        }
    }
    private func suggestion(_ title: String, _ subtitle: String, _ symbol: String, _ prompt: String) -> some View {
        Button { store.draft = prompt; typing = true } label: {
            VStack(alignment: .leading, spacing: 12) {
                Image(systemName: symbol).font(.title3).foregroundStyle(accent)
                Text(title).font(.subheadline.weight(.semibold))
                Text(subtitle).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }.frame(maxWidth: .infinity, minHeight: 110, alignment: .leading).padding(16).background(panel, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(.white.opacity(0.06)))
        }.buttonStyle(.plain)
    }

    private var composer: some View {
        VStack(spacing: 10) {
            if !store.selectedFiles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack { ForEach(store.selectedFiles.sorted(), id: \.self) { file in
                        Button { previewPath = file } label: { Label(URL(fileURLWithPath: file).lastPathComponent, systemImage: "doc.text").font(.caption).padding(8).background(accent.opacity(0.08), in: Capsule()) }.buttonStyle(.plain)
                    } }
                }
            }
            VStack(alignment: .leading, spacing: 16) {
                TextField("Ask, plan, or build something…", text: $store.draft, axis: .vertical).lineLimit(2...7).focused($typing).font(.body).accessibilityIdentifier("chatInput")
                HStack {
                    Button { store.sheet = .files } label: { Label("Context", systemImage: "plus.circle") }.disabled(store.working)
                    Menu {
                        Button("Chat · review only") { store.mode = "review"; store.saveChoices() }
                        Button("Edit selected files") { store.mode = "edit"; store.saveChoices() }
                    } label: { Label(store.mode == "edit" ? "Edit files" : "Chat", systemImage: store.mode == "edit" ? "pencil.line" : "bubble.left").padding(.horizontal, 10).padding(.vertical, 6).background(.white.opacity(0.05), in: Capsule()) }.disabled(store.working)
                    Spacer()
                    if store.working {
                        Button { Task { await store.stop() } } label: { Image(systemName: "stop.fill").frame(width: 38, height: 38).background(.orange.opacity(0.2), in: Circle()) }.accessibilityLabel("Stop task")
                    } else {
                        Button { typing = false; store.send() } label: { Image(systemName: "arrow.up").font(.headline).frame(width: 38, height: 38).background(accent, in: Circle()).foregroundStyle(ink) }
                            .disabled(!store.online || store.projectId.isEmpty || store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty).accessibilityLabel("Send message").keyboardShortcut(.return, modifiers: .command)
                    }
                }.font(.caption).foregroundStyle(.secondary).buttonStyle(.plain)
            }.padding(18).background(panel, in: RoundedRectangle(cornerRadius: 20)).overlay(RoundedRectangle(cornerRadius: 20).stroke(.white.opacity(0.12)))
            Text(store.mode == "edit" ? "Only selected files can change. Originals are backed up on your Mac." : "Chat mode reads selected context. Switch to Edit files to make changes.").font(.system(size: 11)).foregroundStyle(.secondary)
        }.padding(.horizontal, 28).padding(.bottom, 18).padding(.top, 10).frame(maxWidth: 900).frame(maxWidth: .infinity)
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Image(systemName: "doc.text").foregroundStyle(accent)
                Text(previewPath.map { URL(fileURLWithPath: $0).lastPathComponent } ?? "Preview").font(.subheadline.weight(.medium)).lineLimit(1)
                Spacer()
                Button { previewPath = nil } label: { Image(systemName: "xmark") }.accessibilityLabel("Close preview")
            }.padding(20)
            Divider()
            if let path = previewPath {
                HStack {
                    Text(path).font(.caption.monospaced()).foregroundStyle(.secondary).lineLimit(2)
                    Spacer()
                    Button(store.selectedFiles.contains(path) ? "In context" : "Add context") { toggle(path) }.disabled(store.working)
                }.font(.caption).padding(16)
            }
            if loadingPreview { ProgressView("Reading from Mac…").padding(20) }
            if let previewError { ContentUnavailableView("Preview unavailable", systemImage: "doc.badge.ellipsis", description: Text(previewError)) }
            else {
                ScrollView([.horizontal, .vertical]) {
                    HStack(alignment: .top, spacing: 18) {
                        Text((1...max(1, content.components(separatedBy: "\n").count)).map(String.init).joined(separator: "\n")).foregroundStyle(.tertiary)
                        Text(content).textSelection(.enabled).foregroundStyle(.primary)
                    }.font(.system(size: 12, design: .monospaced)).lineSpacing(5).padding(18)
                }
            }
            Spacer(minLength: 0)
            Divider()
            HStack { Label("Read-only preview", systemImage: "eye"); Spacer(); Button { UIPasteboard.general.string = content } label: { Label("Copy", systemImage: "doc.on.doc") }.disabled(content.isEmpty) }.font(.caption).foregroundStyle(.secondary).padding(16)
        }.background(panel.opacity(0.5)).buttonStyle(.plain)
    }
    private func sectionTitle(_ title: String) -> some View { Text(title).font(.system(size: 10, weight: .semibold)).tracking(1.5).foregroundStyle(.secondary) }
    private func toggle(_ path: String) {
        guard !store.working else { return }
        if store.selectedFiles.contains(path) { store.selectedFiles.remove(path) }
        else if store.selectedFiles.count < 20 { store.selectedFiles.insert(path) }
        store.saveChoices()
    }
}
