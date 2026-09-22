import { homeHeroCount } from "./home-kpis";
import {
  dedupeHabits,
  isAwaitingReport,
  isReportDue,
  sortHabitsByReportUrgency,
} from "./habit-stats";
import { filterDueRelationships } from "./relationships-due";
import { topPriorityTasks } from "./task-priority";
import type { Habit, Relationship, Task, TimelineEvent } from "./types";

export const WIDGET_SNAPSHOT_SCHEMA_VERSION = 1;

export type WidgetUrgentHabit = { id: string; title: string; dueLabel: string };
export type WidgetUrgentTask = {
  id: string;
  title: string;
  status: Task["status"];
  dueLabel: string;
};
export type WidgetUrgentFinance = { id: string; titleOrAmountLabel: string };
export type WidgetNextEvent = { id: string; title: string; whenLabel: string };

export type WidgetSnapshot = {
  schemaVersion: number;
  updatedAt: string;
  signedIn: boolean;
  heroCount: number;
  kpis: {
    habitsPending: number;
    tasksDueSoon: number;
    financeUncategorized: number;
    nextEventLabel: string;
  };
  urgentHabit: WidgetUrgentHabit | null;
  urgentTask: WidgetUrgentTask | null;
  urgentFinance: WidgetUrgentFinance | null;
  nextEvent: WidgetNextEvent | null;
};

export function formatUrgentFinanceLabel(row: {
  amount: number;
  merchant: string | null;
  description: string | null;
}): string {
  const name = (row.merchant || row.description || "תנועה").trim();
  const amount = Math.round(row.amount);
  return `₪${amount} · ${name}`;
}

export type WidgetHomeInput = {
  habits: Habit[];
  relationships: Pick<Relationship, "id" | "name" | "last_contact_date" | "reminder_days">[];
  openTasks: Task[];
  openTasksCount: number;
  inProgressTasksCount: number;
  recentEvents: Array<
    Pick<TimelineEvent, "id" | "title" | "title_override" | "source" | "event_date" | "event_time" | "hidden_at">
  >;
  eventsMode: "upcoming" | "recent";
  financeUncategorizedCount: number;
  urgentFinance: WidgetUrgentFinance | null;
  activeGoals: unknown[];
};

function dueSoonCount(tasks: Task[], now: Date): number {
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + 7);
  return tasks.filter((task) => {
    if (!task.due_date) return false;
    return new Date(task.due_date) <= horizon;
  }).length;
}

function eventTitle(e: WidgetHomeInput["recentEvents"][number]): string {
  return e.title_override?.trim() || e.title?.trim() || "אירוע";
}

function whenLabel(e: WidgetHomeInput["recentEvents"][number]): string {
  return e.event_time ? `${e.event_date} ${e.event_time}` : e.event_date;
}

export function buildWidgetSnapshot(args: {
  signedIn: boolean;
  now: Date;
  home: WidgetHomeInput | null;
}): WidgetSnapshot {
  const updatedAt = args.now.toISOString();
  if (!args.signedIn || !args.home) {
    return {
      schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
      updatedAt,
      signedIn: false,
      heroCount: 0,
      kpis: {
        habitsPending: 0,
        tasksDueSoon: 0,
        financeUncategorized: 0,
        nextEventLabel: "",
      },
      urgentHabit: null,
      urgentTask: null,
      urgentFinance: null,
      nextEvent: null,
    };
  }

  const home = args.home;
  const today = args.now;
  const uniqueHabits = dedupeHabits(home.habits, today.toISOString().slice(0, 10));
  const pending = sortHabitsByReportUrgency(uniqueHabits, today).filter((h) =>
    isAwaitingReport(h, today),
  );
  const overdue = uniqueHabits.filter((h) => isReportDue(h, today));
  const dueRelationships = filterDueRelationships(home.relationships as Relationship[], today);
  const tasksDueSoon = dueSoonCount(home.openTasks, today);
  const topTask = topPriorityTasks(home.openTasks, 1)[0] ?? null;
  const nextEv =
    home.eventsMode === "upcoming" && home.recentEvents[0] ? home.recentEvents[0] : null;
  const urgentHabit = pending[0]
    ? { id: pending[0].id, title: pending[0].name, dueLabel: pending[0].report_time || "" }
    : null;
  const urgentTask = topTask
    ? {
        id: topTask.id,
        title: topTask.title,
        status: topTask.status,
        dueLabel: topTask.due_date || "",
      }
    : null;
  const nextEvent = nextEv
    ? {
        id: nextEv.id,
        title: eventTitle(nextEv),
        whenLabel: whenLabel(nextEv),
      }
    : null;

  return {
    schemaVersion: WIDGET_SNAPSHOT_SCHEMA_VERSION,
    updatedAt,
    signedIn: true,
    heroCount: homeHeroCount({
      habitsOverdue: overdue.length,
      dueRelationships: dueRelationships.length,
      tasksDueSoon,
      financeUncategorized: home.financeUncategorizedCount,
    }),
    kpis: {
      habitsPending: pending.length,
      tasksDueSoon,
      financeUncategorized: home.financeUncategorizedCount,
      nextEventLabel: nextEvent ? nextEvent.title : "",
    },
    urgentHabit,
    urgentTask,
    urgentFinance: home.urgentFinance,
    nextEvent,
  };
}
