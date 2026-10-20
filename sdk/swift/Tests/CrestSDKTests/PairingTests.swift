import CrestSDK
import XCTest
import CrestSDK

final class PairingTests: XCTestCase {
    private let code = String(repeating: "a", count: 48)
    private let pin = String(repeating: "b", count: 64)
    private func link(_ endpoint: String) -> String {
        var parts = URLComponents(); parts.scheme = "crest"; parts.host = "pair"
        parts.queryItems = [URLQueryItem(name: "url", value: endpoint), URLQueryItem(name: "code", value: code), URLQueryItem(name: "fingerprint", value: pin)]
        return parts.string!
    }
    func testAcceptsPrivatePinnedHTTPSPairing() throws {
        let parsed = try PairingLink(link("https://my-mac.local:19432"))
        XCTAssertEqual(parsed.code, code); XCTAssertEqual(parsed.fingerprint, pin)
        XCTAssertEqual(parsed.url.host, "my-mac.local")
        XCTAssertNoThrow(try PairingLink(link("https://10.0.0.130:19432")))
    }
    func testRejectsPlaintextPublicHostsAndCredentials() {
        for endpoint in ["http://my-mac.local:19432", "https://example.com", "https://user:password@my-mac.local", "https://my-mac.local?token=bad"] {
            XCTAssertThrowsError(try PairingLink(link(endpoint)))
        }
    }
    func testRejectsDuplicateParametersAndMissingPins() {
        XCTAssertThrowsError(try PairingLink(link("https://my-mac.local") + "&code=" + code))
        XCTAssertThrowsError(try PairingLink("crest://pair?url=https://my-mac.local&code=" + code))
    }
    func testTaskHandleDecodesWithoutOptionalResultFields() throws {
        let data = Data("{\"id\":\"job\",\"status\":\"running\",\"model\":\"qwen3.5:4b\",\"mode\":\"edit\",\"changedFiles\":[]}".utf8)
        let job = try JSONDecoder().decode(CodingJob.self, from: data)
        XCTAssertEqual(job.status, "running"); XCTAssertNil(job.summary)
    }
    func testRequestKeySurvivesRetryEncoding() throws {
        let original = CodingRequest(projectId: "p", prompt: "fix", files: ["add.py"], mode: "edit", model: "qwen3.5:4b", requestKey: UUID().uuidString.lowercased())
        let retry = try JSONDecoder().decode(CodingRequest.self, from: JSONEncoder().encode(original))
        XCTAssertEqual(retry.requestKey, original.requestKey)
    }
}

final class ConnectionValidationTests: XCTestCase {
    func testRejectsMalformedPrivateAddresses() {
        XCTAssertFalse(PairingLink.privateHost("10.bad.0.0.1"))
        XCTAssertFalse(PairingLink.privateHost("10..0.1"))
        XCTAssertTrue(PairingLink.privateHost("MY-MAC.LOCAL"))
    }
    func testRejectsInsecureEndpointBeforeSendingCredentials() async {
        let client = CrestClient(url: URL(string: "http://localhost:19432")!, fingerprint: String(repeating: "a", count: 64), token: "must-not-be-sent")
        do { _ = try await client.status(); XCTFail("HTTP must be rejected") }
        catch { XCTAssertTrue(error.localizedDescription.contains("private HTTPS")) }
    }
    func testRejectsTaskPathInjectionBeforeNetworking() async {
        let client = CrestClient(url: URL(string: "https://localhost:19432")!, fingerprint: String(repeating: "a", count: 64))
        do { _ = try await client.cancel("../projects"); XCTFail("Invalid task ID must be rejected") }
        catch { XCTAssertEqual(error.localizedDescription, "Invalid task ID.") }
    }
}
