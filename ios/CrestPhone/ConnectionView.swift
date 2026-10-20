import SwiftUI
import VisionKit

struct ConnectionView: View {
    @Bindable var store: ChatStore
    @Environment(\.dismiss) private var dismiss
    @State private var scanning = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Label("Private connection to your Mac", systemImage: "lock.laptopcomputer").font(.headline)
                    Text("Qwen runs on your laptop. Your messages and selected files stay between your phone and Mac.").foregroundStyle(.secondary)
                }
                if let laptop = store.laptop {
                    Section("Paired laptop") {
                        LabeledContent("Laptop", value: laptop.laptopName)
                        Text(laptop.url.absoluteString).font(.caption.monospaced()).foregroundStyle(.secondary)
                        Label(store.online ? "Connected" : "Offline", systemImage: store.online ? "checkmark.circle" : "wifi.slash")
                            .foregroundStyle(store.online ? .mint : .orange)
                        Button("Reconnect") { Task { await store.refresh() } }
                        Button("Disconnect laptop", role: .destructive) { store.disconnect() }
                    }
                }
                Section("Pair with Crest") {
                    Text("On your Mac, open Crest → Settings → API & MCP. Enable iPhone access and choose Pair an iPhone.")
                    if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                        Button { scanning = true } label: { Label("Scan laptop QR", systemImage: "qrcode.viewfinder") }
                    }
                    TextField("Or paste the pairing link", text: $store.pairingLink, axis: .vertical)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().font(.caption.monospaced()).accessibilityIdentifier("pairingLink")
                    Button { Task { await store.pair(store.pairingLink) } } label: {
                        HStack { Text("Pair laptop"); if store.pairing { Spacer(); ProgressView() } }
                    }.disabled(store.pairing || store.pairingLink.isEmpty).accessibilityIdentifier("pairLaptop")
                }
                if let error = store.error { Section { Text(error).foregroundStyle(.orange) } }
                Section { Text("Use the same Wi-Fi. Pairing codes expire in five minutes. You can revoke this phone or change its allowed projects in Crest on your Mac.").font(.footnote).foregroundStyle(.secondary) }
            }
            .navigationTitle("Laptop connection").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(isPresented: $scanning) {
                ScannerView { raw in scanning = false; store.pairingLink = raw; Task { await store.pair(raw) } }
                    .ignoresSafeArea()
            }
        }
    }
}

private struct ScannerView: UIViewControllerRepresentable {
    let onRead: (String) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(onRead: onRead) }
    func makeUIViewController(context: Context) -> DataScannerViewController {
        let controller = DataScannerViewController(recognizedDataTypes: [.barcode(symbologies: [.qr])], qualityLevel: .balanced, recognizesMultipleItems: false, isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true, isGuidanceEnabled: true, isHighlightingEnabled: true)
        controller.delegate = context.coordinator
        try? controller.startScanning()
        return controller
    }
    func updateUIViewController(_ controller: DataScannerViewController, context: Context) {}
    static func dismantleUIViewController(_ controller: DataScannerViewController, coordinator: Coordinator) { controller.stopScanning() }
    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onRead: (String) -> Void
        private var finished = false
        init(onRead: @escaping (String) -> Void) { self.onRead = onRead }
        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !finished else { return }
            for item in addedItems { if case .barcode(let code) = item, let raw = code.payloadStringValue, raw.hasPrefix("crest://pair?") {
                finished = true; dataScanner.stopScanning(); onRead(raw); return
            } }
        }
    }
}
