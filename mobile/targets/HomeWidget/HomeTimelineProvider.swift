import WidgetKit

struct HomeTimelineEntry: TimelineEntry {
  let date: Date
}

struct HomeTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> HomeTimelineEntry {
    HomeTimelineEntry(date: Date())
  }

  func getSnapshot(in context: Context, completion: @escaping (HomeTimelineEntry) -> Void) {
    completion(HomeTimelineEntry(date: Date()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<HomeTimelineEntry>) -> Void) {
    let entry = HomeTimelineEntry(date: Date())
    completion(Timeline(entries: [entry], policy: .atEnd))
  }
}
