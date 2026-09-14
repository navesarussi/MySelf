import AppIntents
import Foundation

@available(iOS 16.0, *)
struct LogApplePayExpenseIntent: AppIntent {
  static var title: LocalizedStringResource = "רשום הוצאה ל־MySelf"
  // ASC rejects Intent descriptions containing "apple" (error 90626) — do not use "Apple Pay" here.
  static var description = IntentDescription("שולח עסקת תשלום ל-MySelf לרישום והסיווג.")
  static var openAppWhenRun: Bool = false

  @Parameter(title: "סכום")
  var amount: Double?

  @Parameter(title: "בית עסק")
  var merchant: String?

  @Parameter(title: "שם כרטיס")
  var cardName: String?

  @Parameter(title: "תאריך")
  var date: Date?

  @Parameter(title: "מזהה עסקה")
  var transactionId: String?

  static var parameterSummary: some ParameterSummary {
    Summary("רשום \(\.$amount) ב-\(\.$merchant)")
  }

  func perform() async throws -> some IntentResult {
    guard let amount, amount > 0 else {
      throw LogApplePayExpenseError.missingAmount
    }
    guard let token = FinanceIngestKeychain.resolveAuthToken() else {
      throw LogApplePayExpenseError.missingAuth
    }

    let txnDate = date ?? Date()
    let merchantName = merchant?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let card = cardName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let identifier = resolveIdentifier(
      transactionId: transactionId,
      date: txnDate,
      amount: amount,
      cardName: card
    )

    let body: [String: Any] = [
      "source": "apple_pay",
      "txn_date": formatDate(txnDate),
      "txn_time": formatTime(txnDate),
      "amount": amount,
      "merchant": merchantName,
      "description": merchantName.isEmpty ? "תנועה" : merchantName,
      "card_name": card,
      "identifier": identifier,
    ]

    guard let url = URL(string: "https://myselfapp.xyz/api/v1/finance/ingest") else {
      throw LogApplePayExpenseError.ingestFailed
    }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.timeoutInterval = 30
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try JSONSerialization.data(withJSONObject: body)

    let (data, response) = try await URLSession.shared.data(for: request)
    guard let http = response as? HTTPURLResponse else {
      throw LogApplePayExpenseError.ingestFailed
    }
    guard (200...299).contains(http.statusCode) else {
      if let body = String(data: data, encoding: .utf8), !body.isEmpty {
        throw LogApplePayExpenseError.ingestFailedWithDetail(body)
      }
      throw LogApplePayExpenseError.ingestFailed
    }

    return .result()
  }

  private func formatDate(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    return formatter.string(from: date)
  }

  private func formatTime(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm"
    formatter.timeZone = .current
    return formatter.string(from: date)
  }

  private func resolveIdentifier(
    transactionId: String?,
    date: Date,
    amount: Double,
    cardName: String
  ) -> String {
    if let id = transactionId?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty {
      return id
    }

    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMddHHmmss"
    formatter.timeZone = .current
    let amountPart = String(format: "%.0f", amount * 100)
    return "\(formatter.string(from: date))-\(amountPart)-\(cardName)"
  }
}

@available(iOS 16.0, *)
enum LogApplePayExpenseError: Error, CustomLocalizedStringResourceConvertible {
  case missingAmount
  case missingAuth
  case ingestFailed
  case ingestFailedWithDetail(String)

  var localizedStringResource: LocalizedStringResource {
    switch self {
    case .missingAmount:
      return "חסר סכום עסקה"
    case .missingAuth:
      return "לא מוגדר טוקן — התחבר באפליקציה או הדבק טוקן ingest בהגדרות"
    case .ingestFailed:
      return "שגיאה בשליחה ל-MySelf"
    case .ingestFailedWithDetail(let detail):
      return LocalizedStringResource(stringLiteral: "שגיאה בשליחה ל-MySelf: \(detail)")
    }
  }
}
