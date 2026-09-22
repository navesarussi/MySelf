import Foundation

struct WidgetSnapshot: Codable {
  var schemaVersion: Int
  var updatedAt: String
  var signedIn: Bool
  var heroCount: Int
  var kpis: Kpis
  var urgentHabit: UrgentHabit?
  var urgentTask: UrgentTask?
  var urgentFinance: UrgentFinance?
  var nextEvent: NextEvent?

  struct Kpis: Codable {
    var habitsPending: Int
    var tasksDueSoon: Int
    var financeUncategorized: Int
    var nextEventLabel: String
  }

  struct UrgentHabit: Codable {
    var id: String
    var title: String
    var dueLabel: String
  }

  struct UrgentTask: Codable {
    var id: String
    var title: String
    var status: String
    var dueLabel: String
  }

  struct UrgentFinance: Codable {
    var id: String
    var titleOrAmountLabel: String
  }

  struct NextEvent: Codable {
    var id: String
    var title: String
    var whenLabel: String
  }
}

enum WidgetSnapshotStore {
  static let appGroupId = "group.com.navesarussi.myself"
  static let fileName = "widget-snapshot.json"

  static func load() -> WidgetSnapshot? {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      return nil
    }
    let url = dir.appendingPathComponent(fileName)
    guard let data = try? Data(contentsOf: url) else { return nil }
    return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
  }

  static func save(_ snap: WidgetSnapshot) {
    guard let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
      return
    }
    let url = dir.appendingPathComponent(fileName)
    guard let data = try? JSONEncoder().encode(snap) else { return }
    try? data.write(to: url, options: .atomic)
  }
}

extension WidgetSnapshot {
  static func isStale(updatedAt: String, now: Date = Date()) -> Bool {
    guard let date = Self.parseUpdatedAt(updatedAt) else { return false }
    return now.timeIntervalSince(date) > 6 * 60 * 60
  }

  static func parseUpdatedAt(_ value: String) -> Date? {
    let withFraction = ISO8601DateFormatter()
    withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = withFraction.date(from: value) { return date }

    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: value)
  }
}

#if DEBUG
extension WidgetSnapshot {
  static let previewFull = WidgetSnapshot(
    schemaVersion: 1,
    updatedAt: ISO8601DateFormatter().string(from: Date()),
    signedIn: true,
    heroCount: 4,
    kpis: Kpis(
      habitsPending: 2,
      tasksDueSoon: 1,
      financeUncategorized: 3,
      nextEventLabel: "18:30"
    ),
    urgentHabit: UrgentHabit(id: "h1", title: "מדיטציה", dueLabel: "עכשיו"),
    urgentTask: UrgentTask(id: "t1", title: "לסיים דוח", status: "open", dueLabel: "היום"),
    urgentFinance: UrgentFinance(id: "f1", titleOrAmountLabel: "₪120 · סופר"),
    nextEvent: NextEvent(id: "e1", title: "פגישה", whenLabel: "18:30")
  )

  static let previewPartial = WidgetSnapshot(
    schemaVersion: 1,
    updatedAt: ISO8601DateFormatter().string(from: Date()),
    signedIn: true,
    heroCount: 1,
    kpis: Kpis(
      habitsPending: 1,
      tasksDueSoon: 0,
      financeUncategorized: 0,
      nextEventLabel: "—"
    ),
    urgentHabit: UrgentHabit(id: "h1", title: "מדיטציה", dueLabel: "עכשיו"),
    urgentTask: nil,
    urgentFinance: nil,
    nextEvent: nil
  )

  static let previewSignedOut = WidgetSnapshot(
    schemaVersion: 1,
    updatedAt: ISO8601DateFormatter().string(from: Date()),
    signedIn: false,
    heroCount: 0,
    kpis: Kpis(habitsPending: 0, tasksDueSoon: 0, financeUncategorized: 0, nextEventLabel: ""),
    urgentHabit: nil,
    urgentTask: nil,
    urgentFinance: nil,
    nextEvent: nil
  )

  static let previewStale = WidgetSnapshot(
    schemaVersion: 1,
    updatedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-7 * 60 * 60)),
    signedIn: true,
    heroCount: 2,
    kpis: Kpis(
      habitsPending: 1,
      tasksDueSoon: 1,
      financeUncategorized: 0,
      nextEventLabel: "מחר"
    ),
    urgentHabit: UrgentHabit(id: "h1", title: "מדיטציה", dueLabel: "אתמול"),
    urgentTask: UrgentTask(id: "t1", title: "שיחה", status: "in_progress", dueLabel: "היום"),
    urgentFinance: nil,
    nextEvent: nil
  )
}
#endif
