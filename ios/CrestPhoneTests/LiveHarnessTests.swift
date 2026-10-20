import CrestSDK
import XCTest
@testable import Crest

/// Opt-in integration test against the actual laptop, never a cloud model.
final class LiveHarnessTests: XCTestCase {
    @MainActor
    func testPinnedPairingChatAndLaptopFileEdit() async throws {
        guard let raw = ProcessInfo.processInfo.environment["CREST_LIVE_PAIRING_URL"] else { throw XCTSkip("Requires a fresh local one-time pairing URL.") }
        let link = try PairingLink(raw)
        do {
            _ = try await CrestClient(url: link.url, fingerprint: String(repeating: "0", count: 64)).pair(code: link.code)
            XCTFail("An incorrect certificate pin must not be accepted")
        } catch { /* Expected: do not send a pairing secret to an untrusted certificate. */ }
        let store = ChatStore()
        await store.pair(raw)
        XCTAssertNotNil(store.laptop, store.error ?? "Pairing failed")
        XCTAssertTrue(store.online, store.error ?? "Laptop not reachable")
        guard store.online else { return }
        store.draft = "Reply with exactly PHONE_LOCAL_QWEN_OK in the summary. Do not write files."
        store.send()
        try await waitForAnswer(store)
        XCTAssertTrue(store.messages.contains { $0.role == "assistant" && $0.text.contains("PHONE_LOCAL_QWEN_OK") }, store.error ?? "Missing local reply")

        let file = "phone-harness-smoke-\(UUID().uuidString.lowercased()).py"
        store.selectedFiles = [file]; store.mode = "edit"
        store.draft = "Create \(file) containing a Python function def add(a, b) that returns a + b. Only create that file."
        store.send()
        try await waitForAnswer(store)
        XCTAssertTrue(store.messages.last?.changedFiles.contains(file) == true, store.error ?? store.messages.last?.text ?? "No edit result")
        XCTAssertNotEqual(store.messages.last?.text, "PHONE_LOCAL_QWEN_OK", "An edit result must not display a stale model summary")
        XCTAssertNil(store.pending); XCTAssertNil(store.jobId)
        store.pausePolling()
        store.mode = "review"; store.selectedFiles = []; store.newChat()
    }
    @MainActor
    private func waitForAnswer(_ store: ChatStore) async throws {
        for _ in 0..<180 {
            if !store.working { return }
            if let error = store.error { XCTFail(error); return }
            try await Task.sleep(for: .seconds(1))
        }
        XCTFail("Local Qwen did not finish within three minutes")
    }
}
