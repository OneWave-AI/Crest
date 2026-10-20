import Foundation
import Security
import CryptoKit

enum HarnessError: LocalizedError {
    case message(String)
    case response(Int, String)
    var errorDescription: String? { switch self { case .message(let text), .response(_, let text): return text } }
}
struct PairingLink: Equatable {
    let url: URL
    let code: String
    let fingerprint: String
    init(_ raw: String) throws {
        guard raw.count < 2500, let parts = URLComponents(string: raw), parts.scheme == "crest", parts.host == "pair" else { throw HarnessError.message("Paste the pairing link shown in Crest on your laptop.") }
        let items = parts.queryItems ?? []
        guard Set(items.map(\.name)).count == items.count,
              let endpoint = items.first(where: { $0.name == "url" })?.value,
              let url = URL(string: endpoint), url.scheme == "https", url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/",
              let host = url.host, Self.privateHost(host),
              let code = items.first(where: { $0.name == "code" })?.value, code.range(of: "^[a-f0-9]{48}$", options: .regularExpression) != nil,
              let pin = items.first(where: { $0.name == "fingerprint" })?.value, pin.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
        else { throw HarnessError.message("This pairing link is incomplete or isn't a private HTTPS laptop connection.") }
        self.url = url; self.code = code; self.fingerprint = pin
    }
    static func privateHost(_ host: String) -> Bool {
        if host == "localhost" || host.hasSuffix(".local") { return true }
        let parts = host.split(separator: ".").compactMap { Int($0) }
        guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }) else { return false }
        return parts[0] == 127 || parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) ||
            (parts[0] == 172 && (16...31).contains(parts[1])) || (parts[0] == 100 && (64...127).contains(parts[1]))
    }
}
struct PairedLaptop: Codable, Equatable {
    let url: URL
    let fingerprint: String
    let token: String
    let deviceId: String
    let laptopName: String
}
struct PairResponse: Decodable { let token: String; let deviceId: String; let laptopName: String }
struct LaptopStatus: Decodable { let app: String; let laptopName: String; let localInference: Bool }
struct LaptopProject: Codable, Identifiable, Hashable { let id: String; let name: String; let path: String }
struct LaptopModels: Decodable { let running: Bool; let models: [LaptopModel] }
struct LaptopModel: Decodable, Identifiable { let name: String; let embeddingOnly: Bool; var id: String { name } }
struct FileList: Decodable { let files: [String] }
private struct APIProblem: Decodable { let detail: String }
struct CodingJob: Codable, Identifiable {
    let id: String
    let status: String
    let model: String
    let mode: String
    let summary: String?
    let changedFiles: [String]
    let error: String?
    let backupPath: String?
}
struct CodingRequest: Codable {
    let projectId: String
    let prompt: String
    let files: [String]
    let mode: String
    let model: String
    let requestKey: String
    var history: [ChatTurn]? = nil
}
struct ChatTurn: Codable { let role: String; let content: String }

enum PairingKeychain {
    private static let service = "com.onewave.crest.phone.pairing"
    static func load() -> PairedLaptop? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: "laptop", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(PairedLaptop.self, from: data)
    }
    static func save(_ laptop: PairedLaptop) throws {
        let data = try JSONEncoder().encode(laptop)
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "laptop"]
        let result = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if result == errSecItemNotFound {
            var entry = query; entry[kSecValueData as String] = data
            entry[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
            guard SecItemAdd(entry as CFDictionary, nil) == errSecSuccess else { throw HarnessError.message("Couldn't save laptop credentials in Keychain.") }
        } else if result != errSecSuccess { throw HarnessError.message("Couldn't update laptop credentials in Keychain.") }
    }
    static func clear() { SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service] as CFDictionary) }
}

final class PinnedConnection: NSObject, URLSessionDelegate, URLSessionTaskDelegate, @unchecked Sendable {
    let host: String
    let fingerprint: String
    init(url: URL, fingerprint: String) { self.host = (url.host ?? "").lowercased(); self.fingerprint = fingerprint }
    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        #if DEBUG
        print("Crest TLS challenge: \(challenge.protectionSpace.authenticationMethod), matching host: \(challenge.protectionSpace.host.lowercased() == host)")
        #endif
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host.lowercased() == host, let trust = challenge.protectionSpace.serverTrust,
              let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate], let leaf = chain.first else {
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        let hash = SHA256.hash(data: SecCertificateCopyData(leaf) as Data).map { String(format: "%02x", $0) }.joined()
        guard hash == fingerprint else {
            #if DEBUG
            print("Crest TLS rejected certificate pin")
            #endif
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        SecTrustSetAnchorCertificates(trust, [leaf] as CFArray)
        SecTrustSetAnchorCertificatesOnly(trust, true)
        SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, host as CFString))
        var trustError: CFError?
        guard SecTrustEvaluateWithError(trust, &trustError) else {
            #if DEBUG
            print("Crest TLS trust evaluation: \(String(describing: trustError))")
            #endif
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

final class LaptopClient: @unchecked Sendable {
    let url: URL
    let token: String?
    private let session: URLSession
    init(url: URL, fingerprint: String, token: String? = nil) {
        self.url = url; self.token = token
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = true; config.timeoutIntervalForRequest = 20; config.timeoutIntervalForResource = 35
        config.urlCache = nil
        session = URLSession(configuration: config, delegate: PinnedConnection(url: url, fingerprint: fingerprint), delegateQueue: nil)
    }
    convenience init(_ laptop: PairedLaptop) { self.init(url: laptop.url, fingerprint: laptop.fingerprint, token: laptop.token) }
    deinit { session.invalidateAndCancel() }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        // A short-lived pairing client must keep its session alive across await.
        defer { withExtendedLifetime(self) {} }
        var request = URLRequest(url: url.appendingPathComponent(path))
        request.httpMethod = method; request.httpBody = body
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw HarnessError.message("The laptop returned an invalid response.") }
        guard (200...299).contains(http.statusCode) else {
            let detail = (try? JSONDecoder().decode(APIProblem.self, from: data).detail) ?? "Laptop request failed (\(http.statusCode))."
            throw HarnessError.response(http.statusCode, detail)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func pair(code: String) async throws -> PairResponse {
        let data = try JSONSerialization.data(withJSONObject: ["code": code, "name": "Crest iPhone"])
        return try await request("pair", method: "POST", body: data)
    }
    func start(_ request: CodingRequest) async throws -> CodingJob { try await self.request("v1/tasks", method: "POST", body: JSONEncoder().encode(request)) }
    func job(_ id: String) async throws -> CodingJob { try await request("v1/tasks/\(id)") }
    func cancel(_ id: String) async throws -> CodingJob { try await request("v1/tasks/\(id)", method: "DELETE") }
}
