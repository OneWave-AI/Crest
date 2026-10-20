import Foundation
import Security
import CryptoKit

public enum HarnessError: LocalizedError {
    case message(String)
    case response(Int, String)
    public var errorDescription: String? { switch self { case .message(let text), .response(_, let text): return text } }
}
public struct PairingLink: Equatable {
    public let url: URL
    public let code: String
    public let fingerprint: String
    public init(_ raw: String) throws {
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
    public static func privateHost(_ rawHost: String) -> Bool {
        let host = rawHost.lowercased()
        if host == "localhost" || host.hasSuffix(".local") { return true }
        let components = host.split(separator: ".", omittingEmptySubsequences: false)
        guard components.count == 4 else { return false }
        let parts = components.compactMap { Int($0) }
        guard parts.count == 4, parts.allSatisfy({ (0...255).contains($0) }) else { return false }
        return parts[0] == 127 || parts[0] == 10 || (parts[0] == 192 && parts[1] == 168) ||
            (parts[0] == 172 && (16...31).contains(parts[1])) || (parts[0] == 100 && (64...127).contains(parts[1]))
    }
}
public struct PairedLaptop: Codable, Equatable {
    public init(url: URL, fingerprint: String, token: String, deviceId: String, laptopName: String) { self.url = url; self.fingerprint = fingerprint; self.token = token; self.deviceId = deviceId; self.laptopName = laptopName }
    public let url: URL
    public let fingerprint: String
    public let token: String
    public let deviceId: String
    public let laptopName: String
}
public struct PairResponse: Decodable { public let token: String; public let deviceId: String; public let laptopName: String }
public struct LaptopStatus: Decodable { public let app: String; public let laptopName: String; public let localInference: Bool }
public struct LaptopProject: Codable, Identifiable, Hashable { public let id: String; public let name: String; public let path: String }
public struct LaptopModels: Decodable { public let running: Bool; public let models: [LaptopModel] }
public struct LaptopModel: Decodable, Identifiable { public let name: String; public let embeddingOnly: Bool; public var id: String { name } }
public struct FileList: Decodable { public let files: [String] }
private struct APIProblem: Decodable { public let detail: String }
public struct CodingJob: Codable, Identifiable {
    public let id: String
    public let status: String
    public let model: String
    public let mode: String
    public let summary: String?
    public let changedFiles: [String]
    public let error: String?
    public let backupPath: String?
}
public struct CodingRequest: Codable {
    public init(projectId: String, prompt: String, files: [String] = [], mode: String = "review", model: String = "qwen3.5:4b", requestKey: String = UUID().uuidString.lowercased(), history: [ChatTurn]? = nil) { self.projectId = projectId; self.prompt = prompt; self.files = files; self.mode = mode; self.model = model; self.requestKey = requestKey; self.history = history }
    public let projectId: String
    public let prompt: String
    public let files: [String]
    public let mode: String
    public let model: String
    public let requestKey: String
    public var history: [ChatTurn]? = nil
}
public struct ChatTurn: Codable { public init(role: String, content: String) { self.role = role; self.content = content }; public let role: String; public let content: String }

final class PinnedConnection: NSObject, URLSessionDelegate, URLSessionTaskDelegate, @unchecked Sendable {
    public let host: String
    public let fingerprint: String
    public init(url: URL, fingerprint: String) { self.host = (url.host ?? "").lowercased(); self.fingerprint = fingerprint }
    public func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
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
    public func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

public final class CrestClient: @unchecked Sendable {
    public func status() async throws -> LaptopStatus { try await request("v1/status") }
    public func projects() async throws -> [LaptopProject] { try await request("v1/projects") }
    public func models() async throws -> LaptopModels { try await request("v1/models") }
    public func files(projectID: String) async throws -> [String] {
        guard UUID(uuidString: projectID) != nil else { throw HarnessError.message("Invalid project ID.") }
        let result: FileList = try await request("v1/projects/\(projectID)/files")
        return result.files
    }
    public let url: URL
    private let token: String?
    private let session: URLSession
    public init(url: URL, fingerprint: String, token: String? = nil) {
        self.url = url; self.token = token
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = true; config.timeoutIntervalForRequest = 20; config.timeoutIntervalForResource = 35
        config.urlCache = nil
        session = URLSession(configuration: config, delegate: PinnedConnection(url: url, fingerprint: fingerprint), delegateQueue: nil)
    }
    public convenience init(_ laptop: PairedLaptop) { self.init(url: laptop.url, fingerprint: laptop.fingerprint, token: laptop.token) }
    deinit { session.invalidateAndCancel() }
    func request<T: Decodable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> T {
        // A short-lived pairing client must keep its session alive across await.
        defer { withExtendedLifetime(self) {} }
        guard url.scheme == "https", url.user == nil, url.password == nil,
              url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/",
              let host = url.host, PairingLink.privateHost(host) else {
            throw HarnessError.message("Crest SDK requires a private HTTPS laptop endpoint.")
        }
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
    public func pair(code: String, name: String = "Crest device") async throws -> PairResponse {
        let data = try JSONSerialization.data(withJSONObject: ["code": code, "name": name])
        return try await request("pair", method: "POST", body: data)
    }
    public func start(_ request: CodingRequest) async throws -> CodingJob { try await self.request("v1/tasks", method: "POST", body: JSONEncoder().encode(request)) }
    public func job(_ id: String) async throws -> CodingJob {
        try validateTaskID(id)
        return try await request("v1/tasks/\(id)")
    }
    public func cancel(_ id: String) async throws -> CodingJob {
        try validateTaskID(id)
        return try await request("v1/tasks/\(id)", method: "DELETE")
    }
    private func validateTaskID(_ id: String) throws {
        guard UUID(uuidString: id) != nil else { throw HarnessError.message("Invalid task ID.") }
    }
}
