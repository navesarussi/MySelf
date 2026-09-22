import AppIntents
import WidgetKit

struct TaskAdvanceIntent: AppIntent {
  static var title: LocalizedStringResource = "קידום משימה"
  static var openAppWhenRun: Bool = false

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
    let next = nextTaskStatus(status)
    try await WidgetApiClient.authorizedRequest(
      path: "tasks/\(taskId)",
      method: "PATCH",
      json: ["status": next]
    )
    // Clear only the acted-on row. Full KPI/hero math is rewritten by the app
    // from HomePayload — do not invent decrements here.
    if var snap = WidgetSnapshotStore.load() {
      if snap.urgentTask?.id == taskId { snap.urgentTask = nil }
      snap.updatedAt = ISO8601DateFormatter().string(from: Date())
      WidgetSnapshotStore.save(snap)
    }
    WidgetCenter.shared.reloadTimelines(ofKind: "HomeWidget")
    return .result()
  }
}
