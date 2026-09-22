import Foundation

enum WidgetApiError: Error {
  case unauthorized
  case failed
}

func nextTaskStatus(_ status: String) -> String {
  switch status {
  case "open": return "in_progress"
  case "in_progress": return "stuck"
  case "stuck": return "review"
  case "review": return "done"
  default: return "open"
  }
}

enum WidgetApiClient {
  static let base = URL(string: "https://myselfapp.xyz/api/v1")!

  static func authorizedRequest(path: String, method: String, json: [String: Any]?) async throws {
    guard let token = WidgetKeychain.sessionToken() else { throw WidgetApiError.unauthorized }
    var req = URLRequest(url: base.appending(path: path))
    req.httpMethod = method
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let json {
      req.httpBody = try JSONSerialization.data(withJSONObject: json)
    }
    let (_, response) = try await URLSession.shared.data(for: req)
    guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
      throw WidgetApiError.failed
    }
  }
}
