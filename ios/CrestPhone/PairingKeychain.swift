import Foundation
import Security
import CrestSDK

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
