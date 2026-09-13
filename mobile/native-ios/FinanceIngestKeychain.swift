import Foundation
import Security

enum FinanceIngestKeychain {
  static let service = "com.navesarussi.myself.finance-ingest"
  static let ingestTokenKey = "FINANCE_INGEST_TOKEN"
  static let sessionTokenKey = "myself.session_token"

  @discardableResult
  static func set(_ value: String?, forKey key: String) -> Bool {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
    ]
    SecItemDelete(query as CFDictionary)

    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
      return true
    }

    let add: [String: Any] = query.merging([
      kSecValueData as String: value.data(using: .utf8)!,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]) { $1 }

    return SecItemAdd(add as CFDictionary, nil) == errSecSuccess
  }

  static func get(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func resolveAuthToken() -> String? {
    if let ingest = get(ingestTokenKey), !ingest.isEmpty { return ingest }
    if let session = get(sessionTokenKey), !session.isEmpty { return session }
    return nil
  }
}
