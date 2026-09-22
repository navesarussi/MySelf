import WidgetKit

struct HomeTimelineEntry: TimelineEntry {
  let date: Date
  let snapshot: WidgetSnapshot?
}

struct HomeTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> HomeTimelineEntry {
    HomeTimelineEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (HomeTimelineEntry) -> Void) {
    let snap = WidgetSnapshotStore.load()
    completion(HomeTimelineEntry(date: Date(), snapshot: snap))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HomeTimelineEntry>) -> Void) {
    let snap = WidgetSnapshotStore.load()
    let entry = HomeTimelineEntry(date: Date(), snapshot: snap)
    let nextUpdate = Date().addingTimeInterval(20 * 60)
    completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
  }
}
