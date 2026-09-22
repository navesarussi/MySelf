import AppIntents
import WidgetKit

struct HabitCheckInIntent: AppIntent {
  static var title: LocalizedStringResource = "דיווח הרגל"
  static var openAppWhenRun: Bool = false

  @Parameter(title: "Habit ID")
  var habitId: String

  init() {
    self.habitId = ""
  }

  init(habitId: String) {
    self.habitId = habitId
  }

  func perform() async throws -> some IntentResult {
    try await WidgetApiClient.authorizedRequest(
      path: "habits/\(habitId)/report",
      method: "POST",
      json: ["type": "check_in"]
    )
    if var snap = WidgetSnapshotStore.load() {
      if snap.urgentHabit?.id == habitId { snap.urgentHabit = nil }
      snap.kpis.habitsPending = max(0, snap.kpis.habitsPending - 1)
      snap.heroCount = max(0, snap.heroCount - 1)
      snap.updatedAt = ISO8601DateFormatter().string(from: Date())
      WidgetSnapshotStore.save(snap)
    }
    WidgetCenter.shared.reloadTimelines(ofKind: "HomeWidget")
    return .result()
  }
}
