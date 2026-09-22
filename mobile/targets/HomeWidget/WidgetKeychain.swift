import Foundation
import Security

enum WidgetKeychain {
  static let service = "com.navesarussi.myself.finance-ingest"
  /// Matches entitlements `$(AppIdentifierPrefix)com.navesarussi.myself` (Team ID HVW3H3DLRB).
  static let accessGroup = "HVW3H3DLRB.com.navesarussi.myself"
  static let sessionTokenKey = "myself.session_token"

  static func sessionToken() -> String? {
    let value = get(sessionTokenKey)?.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let value, !value.isEmpty else { return nil }
    return value
  }

  private static func get(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: key,
      kSecAttrAccessGroup as String: accessGroup,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    var result: AnyObject?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}
