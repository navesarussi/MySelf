import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWidgetSnapshot, formatUrgentFinanceLabel } from "../widget-snapshot";

const baseHabit = {
  id: "h1",
  name: "ספורט",
  kind: "build" as const,
  target_note: null,
  streak_count: 1,
  best_streak: 1,
  total_success_days: 1,
  failure_count: 0,
  last_checked_on: null,
  report_time: "21:00",
  last_reported_at: null,
  archived: false,
  created_at: "2026-01-01T00:00:00Z",
};

describe("formatUrgentFinanceLabel", () => {
  it("formats finance label", () => {
    assert.equal(
      formatUrgentFinanceLabel({ amount: 42.2, merchant: "קפה", description: null }),
      "₪42 · קפה"
    );
  });
});

describe("buildWidgetSnapshot", () => {
  it("sets signedOut snapshot when not signed in", () => {
    const snap = buildWidgetSnapshot({
      signedIn: false,
      now: new Date("2026-09-22T12:00:00"),
      home: null,
    });
    assert.equal(snap.schemaVersion, 1);
    assert.equal(snap.signedIn, false);
    assert.equal(snap.heroCount, 0);
    assert.equal(snap.urgentHabit, null);
  });

  it("picks urgent habit, task, finance, and next event from home", () => {
    const snap = buildWidgetSnapshot({
      signedIn: true,
      now: new Date("2026-09-22T12:00:00"),
      home: {
        habits: [baseHabit],
        relationships: [],
        openTasks: [
          {
            id: "t1",
            title: "חשוב",
            project_id: null,
            priority: "urgent",
            status: "open",
            due_date: "2026-09-22",
            notes: null,
            source: "manual",
            external_id: null,
            external_list_id: null,
            external_meta: {},
            synced_at: null,
            created_at: "2026-09-01T00:00:00Z",
            updated_at: "2026-09-01T00:00:00Z",
          },
        ],
        openTasksCount: 1,
        inProgressTasksCount: 0,
        recentEvents: [
          {
            id: "e1",
            title: "פגישה",
            title_override: null,
            source: "manual",
            event_date: "2026-09-23",
            event_time: "10:00",
            hidden_at: null,
          },
        ],
        eventsMode: "upcoming",
        financeUncategorizedCount: 1,
        urgentFinance: { id: "f1", titleOrAmountLabel: "₪42 · קפה" },
        activeGoals: [],
      },
    });
    assert.equal(snap.signedIn, true);
    assert.ok(snap.heroCount >= 1);
    assert.equal(snap.urgentHabit?.id, "h1");
    assert.equal(snap.urgentTask?.id, "t1");
    assert.equal(snap.urgentFinance?.id, "f1");
    assert.equal(snap.nextEvent?.id, "e1");
    assert.match(snap.kpis.nextEventLabel, /פגישה/);
  });
});
