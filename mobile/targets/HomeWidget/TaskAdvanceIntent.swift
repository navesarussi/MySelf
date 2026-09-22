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
    if var snap = WidgetSnapshotStore.load() {
      if snap.urgentTask?.id == taskId { snap.urgentTask = nil }
      snap.kpis.tasksDueSoon = max(0, snap.kpis.tasksDueSoon - 1)
      snap.heroCount = max(0, snap.heroCount - 1)
      snap.updatedAt = ISO8601DateFormatter().string(from: Date())
      WidgetSnapshotStore.save(snap)
    }
    WidgetCenter.shared.reloadTimelines(ofKind: "HomeWidget")
    return .result()
  }
}
