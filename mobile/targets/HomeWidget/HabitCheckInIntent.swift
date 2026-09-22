import AppIntents

/// Task 6: wire API call + snapshot patch + timeline reload.
struct HabitCheckInIntent: AppIntent {
  static var title: LocalizedStringResource = "דיווח הרגל"

  @Parameter(title: "Habit ID")
  var habitId: String

  init() {
    self.habitId = ""
  }

  init(habitId: String) {
    self.habitId = habitId
  }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
