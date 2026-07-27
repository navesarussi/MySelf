import { getSupabase } from "@/lib/supabase";
import { dedupeGoals, dedupeTasks } from "@/lib/data-integrity";
import { dedupeHabits, effectiveStreak, habitReportDay } from "@/lib/habit-stats";
import { filterDueRelationships } from "@/lib/relationships-due";
import { isGmailConnected } from "@/lib/integrations/gmail/client";
import { buildGmailDigest } from "@/lib/agent/gmail";
import type { Habit, Task } from "@/lib/types";

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Compact snapshot for the motivation agent system prompt. */
export type AgentContextOptions = {
  /** Pre-fetch unread Gmail for morning digs. */
  gmailDigest?: boolean;
};

export async function buildAgentContext(now = new Date(), opts: AgentContextOptions = {}) {
  const supabase = getSupabase();
  const today = now.toISOString().slice(0, 10);

  const [habitsRes, goalsRes, tasksRes, relRes, eventsRes, commitmentsRes, gmailConnected] =
    await Promise.all([
    supabase.from("habits").select("*").eq("archived", false),
    supabase.from("goals").select("*").eq("status", "active"),
    supabase
      .from("tasks")
      .select("id, title, priority, status, due_date, source, project_id")
      .in("status", ["open", "in_progress", "stuck", "review"]),
    supabase
      .from("relationships")
      .select("id, name, last_contact_date, reminder_days")
      .order("name"),
    supabase
      .from("timeline_events")
      .select("id, title, event_date, event_time, category")
      .is("hidden_at", null)
      .gte("event_date", today)
      .order("event_date")
      .limit(10),
    supabase
      .from("commitments")
      .select("id, text, status, commitment_date")
      .eq("commitment_date", today),
    isGmailConnected(),
  ]);

  const habits = dedupeHabits(habitsRes.data || []);
  const goals = dedupeGoals(goalsRes.data || []);
  const tasks = dedupeTasks((tasksRes.data as Task[]) || []).sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  );
  const dueRels = filterDueRelationships(relRes.data || [], now);
  const rawEvents = eventsRes.data || [];

  const habitsPending = habits.filter((h: Habit) => {
    const day = habitReportDay(h.report_time, now);
    return h.last_checked_on !== day;
  });

  const gmail_digest = opts.gmailDigest && gmailConnected ? await buildGmailDigest() : null;

  return {
    date: today,
    gmail_connected: gmailConnected,
    ...(gmail_digest ? { gmail_digest } : {}),
    habits: {
      total: habits.length,
      pending_report: habitsPending.map((h) => ({
        id: h.id,
        name: h.name,
        streak: effectiveStreak(h, today),
        best_streak: h.best_streak,
      })),
    },
    goals: goals.map((g) => ({ id: g.id, title: g.title, category: g.category })),
    top_tasks: tasks.slice(0, 8).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      due_date: t.due_date,
      source: t.source,
    })),
    relationships_due: dueRels.slice(0, 5).map((r) => ({
      id: r.id,
      name: r.name,
      last_contact_date: r.last_contact_date,
      reminder_days: r.reminder_days,
    })),
    today_events: rawEvents.slice(0, 5).map((e) => ({
      id: e.id,
      title: e.title,
      event_date: e.event_date,
      event_time: e.event_time,
    })),
    today_commitments: (commitmentsRes.data || []).map((c) => ({
      id: c.id,
      text: c.text,
      status: c.status,
    })),
  };
}
