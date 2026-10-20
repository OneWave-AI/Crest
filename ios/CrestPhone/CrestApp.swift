import SwiftUI

@main
struct CrestApp: App {
    @State private var store = ChatStore()
    @Environment(\.scenePhase) private var scenePhase
    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
                .tint(.mint)
                .preferredColorScheme(.dark)
                .onOpenURL { url in store.pairingLink = url.absoluteString; store.sheet = .connection }
                .task {
                    #if DEBUG
                    if store.laptop == nil, let link = ProcessInfo.processInfo.environment["CREST_PAIRING_URL"] { await store.pair(link) }
                    #endif
                    await store.refresh()
                }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await store.refresh() } }
                    if phase == .background { store.pausePolling() }
                }
        }
    }
}
