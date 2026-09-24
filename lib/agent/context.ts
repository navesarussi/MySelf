import { getSupabase } from "@/lib/supabase";
import { userDb } from "@/lib/db/user-db";
import { dedupeGoals, dedupeTasks } from "@/lib/data-integrity";
import { dedupeHabits, effectiveStreak, isReportDue } from "@/lib/habit-stats";
import { filterDueRelationships } from "@/lib/relationships-due";
import { getGmailConnectionStatus } from "@/lib/integrations/gmail/status";
import { buildGmailDigest } from "@/lib/agent/gmail";
import { effectiveTaskPriority, rankUrgentTasks } from "@/lib/agent/task-urgency";
import type { Habit, Task } from "@/lib/types";

/** Compact snapshot for the motivation agent system prompt. */
export type AgentContextOptions = {
  /** Pre-fetch unread Gmail for morning digs. */
  gmailDigest?: boolean;
  /** Smaller JSON for WhatsApp latency. */
  compact?: boolean;
};

export async function buildAgentContext(now = new Date(), opts: AgentContextOptions = {}) {
  const supabase = getSupabase();
  const db = await userDb();
  const today = now.toISOString().slice(0, 10);

  const [habitsRes, goalsRes, tasksRes, relRes, eventsRes, commitmentsRes, gmailStatus] =
    await Promise.all([
    db.from("habits").select("*").eq("archived", false),
    db.from("goals").select("*").eq("status", "active"),
    db
      .from("tasks")
      .select("id, title, priority, status, due_date, source, project_id")
      .in("status", ["open", "in_progress", "stuck", "review"]),
    db
      .from("relationships")
      .select("id, name, last_contact_date, reminder_days")
      .order("name"),
    db
      .from("timeline_events")
      .select("id, title, event_date, event_time, category")
      .is("hidden_at", null)
      .gte("event_date", today)
      .order("event_date")
      .limit(10),
    db
      .from("commitments")
      .select("id, text, status, commitment_date")
      .eq("commitment_date", today),
    getGmailConnectionStatus(),
  ]);

  const habits = dedupeHabits(habitsRes.data || []);
  const goals = dedupeGoals(goalsRes.data || []);
  const tasks = dedupeTasks((tasksRes.data as Task[]) || []);
  const urgentTasks = rankUrgentTasks(tasks, now);
  const dueRels = filterDueRelationships(relRes.data || [], now);
  const rawEvents = eventsRes.data || [];

  const habitsPending = habits.filter((h: Habit) => isReportDue(h, now));

  const gmail_digest = opts.gmailDigest && gmailStatus.working ? await buildGmailDigest() : null;

  return {
    date: today,
    gmail_connected: gmailStatus.connected,
    gmail_working: gmailStatus.working,
    ...(gmailStatus.error ? { gmail_error: gmailStatus.error } : {}),
    ...(gmail_digest ? { gmail_digest } : {}),
    habits: opts.compact
      ? { total: habits.length, pending_report_count: habitsPending.length }
      : {
          total: habits.length,
          pending_report: habitsPending.map((h) => ({
            id: h.id,
            name: h.name,
            streak: effectiveStreak(h, today),
            best_streak: h.best_streak,
          })),
        },
    goals: goals.map((g) => ({ id: g.id, title: g.title, category: g.category })),
    top_urgent_tasks: urgentTasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      effective_priority: effectiveTaskPriority(t, now),
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
