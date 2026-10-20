import SwiftUI

private let canvas = Color(red: 0.035, green: 0.055, blue: 0.075)
private let surface = Color(red: 0.07, green: 0.095, blue: 0.12)

struct ContentView: View {
    @Bindable var store: ChatStore
    @FocusState private var composing: Bool
    @Environment(\.horizontalSizeClass) private var sizeClass
    var body: some View {
        Group {
            if sizeClass == .regular {
                IPadWorkspace(store: store)
            } else { chat }
        }
    }
    private var chat: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if store.laptop == nil { welcome }
                else {
                    contextBar
                    conversation
                    if let error = store.error { errorBanner(error) }
                    composer
                }
            }
            .background(canvas)
            .navigationTitle("Crest")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { store.sheet = .connection } label: {
                        Image(systemName: store.laptop == nil ? "link" : "laptopcomputer")
                            .foregroundStyle(store.online ? .mint : .secondary)
                    }.accessibilityLabel("Laptop connection")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { store.newChat() } label: { Image(systemName: "square.and.pencil") }
                        .disabled(store.working || store.laptop == nil).accessibilityLabel("New conversation")
                }
            }
            .sheet(item: $store.sheet) { sheet in
                switch sheet {
                case .connection: ConnectionView(store: store)
                case .files: FilesView(store: store)
                }
            }
        }
    }
    private var welcome: some View {
        VStack(alignment: .leading, spacing: 26) {
            Spacer()
            Image(systemName: "chevron.left.forwardslash.chevron.right")
                .font(.system(size: 52, weight: .light)).foregroundStyle(.mint)
            VStack(alignment: .leading, spacing: 12) {
                Text("Your laptop.\nYour coding agent.").font(.system(size: 38, weight: .semibold, design: .rounded)).tracking(-1)
                Text("Chat with Qwen, build ideas, and edit your projects from your iPhone or iPad.")
                    .font(.title3).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            }
            Label("Runs on your Mac · No inference bill", systemImage: "bolt.shield")
                .font(.subheadline).foregroundStyle(.mint)
            if store.pairing { ProgressView("Pairing with your laptop…") }
            if let error = store.error { Text(error).font(.footnote).foregroundStyle(.orange).textSelection(.enabled) }
            Spacer()
            Button { store.sheet = .connection } label: {
                Label("Connect your laptop", systemImage: "qrcode.viewfinder").font(.headline).frame(maxWidth: .infinity).padding(10)
            }.buttonStyle(.borderedProminent).foregroundStyle(canvas)
            Text("Open Crest on your Mac → Settings → API & MCP → Pair a device.")
                .font(.footnote).foregroundStyle(.secondary).padding(.bottom, 20)
        }.padding(28)
    }
    private var contextBar: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 7) {
                Circle().fill(store.online ? .mint : .orange).frame(width: 6, height: 6)
                Text(store.online ? "CONNECTED TO YOUR MAC" : "LAPTOP OFFLINE")
                    .font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1.5)
                Spacer()
                Text("LOCAL").font(.system(size: 10, weight: .bold)).foregroundStyle(.mint)
            }
            HStack {
                Menu {
                    ForEach(store.projects) { project in
                        Button(project.name) { store.projectId = project.id; store.selectedFiles = []; store.saveChoices() }
                    }
                } label: { Label(store.projectName, systemImage: "folder").lineLimit(1) }
                .disabled(store.working)
                Spacer(minLength: 10)
                Menu {
                    ForEach(store.models) { model in Button(model.name) { store.model = model.name; store.saveChoices() } }
                } label: { HStack(spacing: 4) { Text(store.model).lineLimit(1); Image(systemName: "chevron.down").font(.caption2) }.foregroundStyle(.secondary) }
                .disabled(store.working)
            }.font(.subheadline)
        }.padding(16).background(surface.opacity(0.65))
    }
    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    if store.messages.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("What are we building?").font(.title2.bold())
                            Text("Ask a coding question, explore an idea, or select files and let Qwen make a change on your laptop.")
                                .foregroundStyle(.secondary).lineSpacing(4)
                            ForEach(["Help me build a simple app", "Explain the selected files", "Review the selected files"], id: \.self) { prompt in
                                Button { store.draft = prompt; composing = true } label: {
                                    HStack { Text(prompt); Spacer(); Image(systemName: "arrow.up.left") }.font(.subheadline).padding(14).background(surface, in: RoundedRectangle(cornerRadius: 12))
                                }.foregroundStyle(.primary)
                            }
                        }.padding(.top, 28)
                    }
                    ForEach(store.messages) { MessageRow(message: $0) }
                    if store.working {
                        HStack(spacing: 10) { ProgressView().controlSize(.small); Text("Qwen is working on your laptop…").font(.subheadline).foregroundStyle(.secondary) }.id("working")
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }.padding(20).frame(maxWidth: 900).frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.messages.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            .onChange(of: store.working) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
        }
    }
    private func errorBanner(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(text, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.orange)
            Button(store.working ? "Reconnect to task" : "Reconnect") { Task { if store.working { store.retry() } else { await store.refresh() } } }.font(.footnote.bold())
        }.frame(maxWidth: .infinity, alignment: .leading).padding(14).background(.orange.opacity(0.08))
    }
    private var composer: some View {
        VStack(spacing: 12) {
            HStack {
                Button { store.sheet = .files } label: { Label(store.selectedFiles.isEmpty ? "Add files" : "\(store.selectedFiles.count) files", systemImage: "paperclip") }
                    .accessibilityIdentifier("selectFiles")
                Spacer()
                Picker("Task mode", selection: $store.mode) { Text("Chat").tag("review"); Text("Edit files").tag("edit") }
                    .pickerStyle(.segmented).frame(width: 170).disabled(store.working)
                    .onChange(of: store.mode) { _, _ in store.saveChoices() }
            }.font(.footnote).disabled(store.working)
            HStack(alignment: .bottom, spacing: 12) {
                TextField("Message your local Qwen…", text: $store.draft, axis: .vertical)
                    .lineLimit(1...6).focused($composing).accessibilityIdentifier("chatInput")
                    .padding(14).background(surface, in: RoundedRectangle(cornerRadius: 18))
                if store.working {
                    Button { Task { await store.stop() } } label: { Image(systemName: "stop.fill").frame(width: 42, height: 42).background(.orange.opacity(0.2), in: Circle()).foregroundStyle(.orange) }.accessibilityLabel("Stop task")
                } else {
                    Button { composing = false; store.send() } label: { Image(systemName: "arrow.up").font(.headline).frame(width: 42, height: 42).background(.mint, in: Circle()).foregroundStyle(canvas) }
                        .disabled(!store.online || store.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.projectId.isEmpty)
                        .accessibilityLabel("Send message").accessibilityIdentifier("sendMessage")
                }
            }
            Text(store.mode == "edit" ? "Edits only selected files · Originals backed up on Mac" : "Local Qwen · Your Mac stays awake and connected")
                .font(.system(size: 10)).foregroundStyle(.secondary)
        }.padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 10).background(canvas)
    }
}

struct MessageRow: View {
    let message: ChatMessage
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(message.role == "user" ? "YOU" : "QWEN · ON YOUR MAC")
                .font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(1.5)
                .foregroundStyle(message.role == "user" ? Color.secondary : .mint)
            let parts = message.text.components(separatedBy: "```")
            ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                if index % 2 == 1 {
                    let code = part.contains("\n") ? String(part.drop(while: { $0 != "\n" }).dropFirst()) : part
                    VStack(alignment: .trailing, spacing: 8) {
                        Button { UIPasteboard.general.string = code } label: { Label("Copy", systemImage: "doc.on.doc").font(.caption) }
                        ScrollView(.horizontal) { Text(code).font(.system(.footnote, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
                    }.padding(12).background(surface, in: RoundedRectangle(cornerRadius: 12))
                } else if !part.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Text((try? AttributedString(markdown: part, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(part))
                        .lineSpacing(4).textSelection(.enabled).foregroundStyle(message.failed ? .orange : .primary)
                }
            }
            ForEach(message.changedFiles, id: \.self) { file in Label(file, systemImage: "checkmark.circle.fill").font(.caption.monospaced()).foregroundStyle(.mint) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
