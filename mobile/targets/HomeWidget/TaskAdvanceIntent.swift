import AppIntents

/// Task 6: wire API call + snapshot patch + timeline reload.
struct TaskAdvanceIntent: AppIntent {
  static var title: LocalizedStringResource = "קידום משימה"

  @Parameter(title: "Task ID")
  var taskId: String

  @Parameter(title: "Status")
  var status: String

  init() {
    self.taskId = ""
    self.status = ""
  }

  init(taskId: String, status: String) {
    self.taskId = taskId
    self.status = status
  }

  func perform() async throws -> some IntentResult {
    return .result()
  }
}
