import AppIntents
import SwiftUI
import WidgetKit

private enum WidgetColors {
  static let background = Color(red: 0x0b / 255, green: 0x0c / 255, blue: 0x10 / 255)
  static let card = Color(red: 0x15 / 255, green: 0x17 / 255, blue: 0x1d / 255)
  static let accent = Color(red: 0x7d / 255, green: 0xd3 / 255, blue: 0xc0 / 255)
  static let text = Color.white
  static let muted = Color.white.opacity(0.55)
  static let warn = Color(red: 0xf5 / 255, green: 0xa6 / 255, blue: 0x23 / 255)
}

struct HomeWidgetEntryView: View {
  var entry: HomeTimelineEntry

  var body: some View {
    Group {
      if let snapshot = entry.snapshot {
        if snapshot.signedIn {
          dashboard(snapshot)
        } else {
          signedOutView
        }
      } else {
        waitingView
      }
    }
    .environment(\.layoutDirection, .rightToLeft)
    .containerBackground(for: .widget) {
      WidgetColors.background
    }
  }

  private var signedOutView: some View {
    Link(destination: URL(string: "myself://")!) {
      VStack(spacing: 8) {
        Text("MySelf")
          .font(.headline)
          .foregroundStyle(WidgetColors.text)
        Text("התחבר באפליקציה")
          .font(.subheadline)
          .foregroundStyle(WidgetColors.accent)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private var waitingView: some View {
    VStack(spacing: 8) {
      Text("MySelf")
        .font(.headline)
        .foregroundStyle(WidgetColors.text)
      Text("ממתין לעדכון…")
        .font(.caption)
        .foregroundStyle(WidgetColors.muted)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func dashboard(_ snapshot: WidgetSnapshot) -> some View {
    VStack(alignment: .trailing, spacing: 10) {
      heroSection(count: snapshot.heroCount)
      kpiRow(snapshot.kpis)
      habitRow(snapshot.urgentHabit)
      taskRow(snapshot.urgentTask)
      financeRow(snapshot.urgentFinance)

      if WidgetSnapshot.isStale(updatedAt: snapshot.updatedAt) {
        Text("לא עודכן לאחרונה")
          .font(.caption2)
          .foregroundStyle(WidgetColors.muted)
          .frame(maxWidth: .infinity, alignment: .center)
      }
    }
    .padding(14)
  }

  private func heroSection(count: Int) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text("דחוף היום")
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(WidgetColors.text)
      Spacer(minLength: 0)
      Text("\(count)")
        .font(.system(size: 36, weight: .bold, design: .rounded))
        .foregroundStyle(count > 0 ? WidgetColors.warn : WidgetColors.accent)
    }
  }

  private func kpiRow(_ kpis: WidgetSnapshot.Kpis) -> some View {
    HStack(spacing: 6) {
      kpiCell(title: "הרגלים", value: "\(kpis.habitsPending)")
      kpiCell(title: "משימות", value: "\(kpis.tasksDueSoon)")
      kpiCell(title: "לסיווג", value: "\(kpis.financeUncategorized)")
      kpiCell(title: "אירוע", value: kpis.nextEventLabel.isEmpty ? "—" : kpis.nextEventLabel)
    }
  }

  private func kpiCell(title: String, value: String) -> some View {
    VStack(spacing: 2) {
      Text(value)
        .font(.caption.weight(.bold))
        .foregroundStyle(WidgetColors.accent)
        .lineLimit(1)
        .minimumScaleFactor(0.7)
      Text(title)
        .font(.caption2)
        .foregroundStyle(WidgetColors.muted)
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 8)
    .background(WidgetColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 8))
  }

  private func habitRow(_ habit: WidgetSnapshot.UrgentHabit?) -> some View {
    urgencyRow(
      title: habit?.title,
      subtitle: habit?.dueLabel,
      emptyText: "אין הרגל דחוף"
    ) {
      if let habit {
        Button(intent: HabitCheckInIntent(habitId: habit.id)) {
          Image(systemName: "checkmark.circle.fill")
            .font(.title3)
            .foregroundStyle(WidgetColors.accent)
        }
        .buttonStyle(.plain)
      }
    }
  }

  private func taskRow(_ task: WidgetSnapshot.UrgentTask?) -> some View {
    urgencyRow(
      title: task?.title,
      subtitle: task?.dueLabel,
      emptyText: "אין משימה דחופה"
    ) {
      if let task {
        Button(intent: TaskAdvanceIntent(taskId: task.id, status: task.status)) {
          Image(systemName: "arrow.forward.circle.fill")
            .font(.title3)
            .foregroundStyle(WidgetColors.accent)
        }
        .buttonStyle(.plain)
      }
    }
  }

  private func financeRow(_ finance: WidgetSnapshot.UrgentFinance?) -> some View {
    Group {
      if let finance {
        Link(destination: URL(string: "myself://finance-categorize?id=\(finance.id)")!) {
          urgencyCard(title: finance.titleOrAmountLabel, subtitle: "לסיווג", emptyText: nil)
        }
      } else {
        urgencyCard(title: nil, subtitle: nil, emptyText: "אין תנועה לסיווג")
      }
    }
  }

  private func urgencyRow<Trailing: View>(
    title: String?,
    subtitle: String?,
    emptyText: String,
    @ViewBuilder trailing: () -> Trailing
  ) -> some View {
    HStack(spacing: 10) {
      trailing()
      urgencyCard(title: title, subtitle: subtitle, emptyText: emptyText)
    }
  }

  private func urgencyCard(title: String?, subtitle: String?, emptyText: String?) -> some View {
    VStack(alignment: .trailing, spacing: 2) {
      if let title, !title.isEmpty {
        Text(title)
          .font(.subheadline.weight(.medium))
          .foregroundStyle(WidgetColors.text)
          .lineLimit(1)
        if let subtitle, !subtitle.isEmpty {
          Text(subtitle)
            .font(.caption2)
            .foregroundStyle(WidgetColors.muted)
            .lineLimit(1)
        }
      } else if let emptyText {
        Text(emptyText)
          .font(.caption)
          .foregroundStyle(WidgetColors.muted)
          .frame(maxWidth: .infinity, alignment: .trailing)
      }
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(WidgetColors.card)
    .clipShape(RoundedRectangle(cornerRadius: 10))
  }
}

#if DEBUG
#Preview("Full", as: .systemLarge) {
  HomeWidget()
} timeline: {
  HomeTimelineEntry(date: .now, snapshot: .previewFull)
}

#Preview("Partial", as: .systemLarge) {
  HomeWidget()
} timeline: {
  HomeTimelineEntry(date: .now, snapshot: .previewPartial)
}

#Preview("Signed out", as: .systemLarge) {
  HomeWidget()
} timeline: {
  HomeTimelineEntry(date: .now, snapshot: .previewSignedOut)
}

#Preview("Stale", as: .systemLarge) {
  HomeWidget()
} timeline: {
  HomeTimelineEntry(date: .now, snapshot: .previewStale)
}

#Preview("No snapshot", as: .systemLarge) {
  HomeWidget()
} timeline: {
  HomeTimelineEntry(date: .now, snapshot: nil)
}
#endif
