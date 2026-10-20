import SwiftUI

struct FilesView: View {
    @Bindable var store: ChatStore
    @Environment(\.dismiss) private var dismiss
    @State private var files: [String] = []
    @State private var query = ""
    @State private var newPath = ""
    @State private var error: String?
    @State private var loading = true
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Choose the files Qwen can read. In Edit files mode, these are also the only files it can change.").font(.footnote).foregroundStyle(.secondary)
                }
                Section("Create a new file") {
                    HStack {
                        TextField("e.g. src/hello.py", text: $newPath).font(.subheadline.monospaced()).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("newFilePath")
                        Button("Add") {
                            let path = newPath.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !path.isEmpty else { return }
                            store.selectedFiles.insert(path); store.saveChoices(); newPath = ""
                        }.disabled(newPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.selectedFiles.count >= 20).accessibilityIdentifier("addNewFile")
                    }
                }
                if !store.selectedFiles.isEmpty { Section("Selected · \(store.selectedFiles.count)/20") { ForEach(store.selectedFiles.sorted(), id: \.self) { row($0) } } }
                Section("\(store.projectName) files") {
                    if loading { ProgressView("Loading from laptop…") }
                    ForEach(files.filter { !store.selectedFiles.contains($0) && (query.isEmpty || $0.localizedCaseInsensitiveContains(query)) }, id: \.self) { row($0) }
                    if !loading && files.isEmpty { Text("No source files yet. Add a new file above.").foregroundStyle(.secondary) }
                    if let error { Text(error).foregroundStyle(.orange) }
                }
            }
            .searchable(text: $query, prompt: "Find a source file")
            .navigationTitle("Project files").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.saveChoices(); dismiss() } } }
            .task { do { files = try await store.files() } catch { self.error = error.localizedDescription }; loading = false }
        }
    }
    private func row(_ file: String) -> some View {
        Button {
            if store.selectedFiles.contains(file) { store.selectedFiles.remove(file) }
            else if store.selectedFiles.count < 20 { store.selectedFiles.insert(file) }
            store.saveChoices()
        } label: {
            HStack { Text(file).font(.caption.monospaced()).foregroundStyle(.primary); Spacer(); Image(systemName: store.selectedFiles.contains(file) ? "checkmark.circle.fill" : "circle").foregroundStyle(store.selectedFiles.contains(file) ? .mint : .secondary) }
        }
    }
}
