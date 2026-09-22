import WidgetKit
import SwiftUI

@main
struct HomeWidgetBundle: WidgetBundle {
  var body: some Widget {
    HomeWidget()
  }
}

struct HomeWidget: Widget {
  let kind = "HomeWidget"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: HomeTimelineProvider()) { entry in
      HomeWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("MySelf")
    .description("דשבורד דחיפות")
    .supportedFamilies([.systemLarge])
  }
}
