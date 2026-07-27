import { getSupabase } from "@/lib/supabase";
import { dedupeTasks } from "@/lib/data-integrity";
import { computeCheckIn, computeFall, habitReportDay } from "@/lib/habit-stats";
import type { Habit, Task, TaskPriority, TaskStatus } from "@/lib/types";

const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low"];
const STATUSES: TaskStatus[] = ["open", "in_progress", "stuck", "review", "done"];

export async function agentListTasks(filters?: {
  status?: TaskStatus;
  priority?: TaskPriority;
  limit?: number;
}) {
  let query = getSupabase()
    .from("tasks")
    .select("id, title, priority, status, due_date, source, notes, project_id");
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.priority) query = query.eq("priority", filters.priority);
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw new Error("tasks_list_failed");
  const limit = filters?.limit ?? 20;
  return dedupeTasks((data as Task[]) || []).slice(0, limit);
}

export async function agentUpdateTask(
  id: string,
  patch: { status?: TaskStatus; priority?: TaskPriority; title?: string; notes?: string | null }
) {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status && (STATUSES as string[]).includes(patch.status)) body.status = patch.status;
  if (patch.priority && (PRIORITIES as string[]).includes(patch.priority)) body.priority = patch.priority;
  if (patch.title) body.title = patch.title.trim();
  if (patch.notes !== undefined) body.notes = patch.notes;

  const { data, error } = await getSupabase().from("tasks").update(body).eq("id", id).select().single();
  if (error) throw new Error("task_update_failed");
  return data;
}

export async function agentCreateTask(input: {
  title: string;
  project_id: string;
  priority?: TaskPriority;
  due_date?: string | null;
}) {
  const { data, error } = await getSupabase()
    .from("tasks")
    .insert({
      title: input.title.trim(),
      project_id: input.project_id,
      priority: input.priority ?? "medium",
      status: "open",
      due_date: input.due_date ?? null,
      source: "manual",
    })
    .select()
    .single();
  if (error) throw new Error("task_create_failed");
  return data;
}

export async function agentListHabits() {
  const { data, error } = await getSupabase().from("habits").select("*").eq("archived", false);
  if (error) throw new Error("habits_list_failed");
  return data || [];
}

export async function agentReportHabit(id: string, type: "check_in" | "fall") {
  const { data: habit, error: fetchErr } = await getSupabase()
    .from("habits")
    .select("*")
    .eq("id", id)
    .single<Habit>();
  if (fetchErr || !habit) throw new Error("habit_not_found");

  const today = habitReportDay(habit.report_time);
  if (habit.last_checked_on === today) return habit;

  const result = type === "check_in" ? computeCheckIn(habit, today) : computeFall(habit, today);
  const { data, error } = await getSupabase()
    .from("habits")
    .update({
      streak_count: result.streak,
      best_streak: result.bestStreak,
      total_success_days: result.totalSuccessDays,
      failure_count: result.failureCount,
      last_checked_on: today,
      last_reported_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("habit_report_failed");
  return data;
}

export async function agentListGoals(status: "active" | "done" = "active") {
  const { data, error } = await getSupabase().from("goals").select("*").eq("status", status);
  if (error) throw new Error("goals_list_failed");
  return data || [];
}

export async function agentUpdateGoal(
  id: string,
  patch: { status?: "active" | "done"; title?: string; first_step?: string | null }
) {
  const body: Record<string, unknown> = {};
  if (patch.status) body.status = patch.status;
  if (patch.title) body.title = patch.title.trim();
  if (patch.first_step !== undefined) body.first_step = patch.first_step;

  const { data, error } = await getSupabase().from("goals").update(body).eq("id", id).select().single();
  if (error) throw new Error("goal_update_failed");
  return data;
}

export async function agentListCommitments(date?: string) {
  let query = getSupabase().from("commitments").select("*");
  if (date) query = query.eq("commitment_date", date);
  const { data, error } = await query.order("commitment_date", { ascending: false });
  if (error) throw new Error("commitments_list_failed");
  return data || [];
}

export async function agentCreateCommitment(text: string, date: string) {
  const { data, error } = await getSupabase()
    .from("commitments")
    .insert({ text: text.trim(), commitment_date: date, status: "pending" })
    .select()
    .single();
  if (error) throw new Error("commitment_create_failed");
  return data;
}

export async function agentUpdateCommitment(id: string, status: "pending" | "done" | "missed") {
  const { data, error } = await getSupabase()
    .from("commitments")
    .update({ status })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("commitment_update_failed");
  return data;
}

export async function agentListRelationships() {
  const { data, error } = await getSupabase()
    .from("relationships")
    .select("id, name, last_contact_date, reminder_days, notes, project_id, phone, email");
  if (error) throw new Error("relationships_list_failed");
  return data || [];
}

export async function agentCreateRelationship(input: {
  name: string;
  project_id: string;
  reminder_days?: number;
  notes?: string | null;
  phone?: string | null;
  email?: string | null;
  group_name?: string | null;
}) {
  const reminder =
    input.reminder_days && input.reminder_days > 0 ? Math.floor(input.reminder_days) : 7;
  const { data, error } = await getSupabase()
    .from("relationships")
    .insert({
      name: input.name.trim(),
      project_id: input.project_id,
      reminder_days: reminder,
      notes: input.notes ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      group_name: input.group_name ?? null,
    })
    .select()
    .single();
  if (error) throw new Error("relationship_create_failed");
  return data;
}

export async function agentUpdateRelationship(
  id: string,
  patch: {
    name?: string;
    reminder_days?: number | null;
    notes?: string | null;
    last_contact_date?: string | null;
    phone?: string | null;
  }
) {
  const body: Record<string, unknown> = {};
  if (patch.name) body.name = patch.name.trim();
  if (patch.reminder_days !== undefined) body.reminder_days = patch.reminder_days;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.last_contact_date !== undefined) body.last_contact_date = patch.last_contact_date;
  if (patch.phone !== undefined) body.phone = patch.phone;

  const { data, error } = await getSupabase()
    .from("relationships")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("relationship_update_failed");
  return data;
}

export async function agentTouchRelationship(id: string, date: string) {
  const { data, error } = await getSupabase()
    .from("relationships")
    .update({ last_contact_date: date })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("relationship_update_failed");
  return data;
}

export async function agentListProjects() {
  const { data, error } = await getSupabase().from("projects").select("id, name").order("sort_order");
  if (error) throw new Error("projects_list_failed");
  return data || [];
}

export async function agentUpdateDigSchedule(input: {
  dig_hours?: number[];
  morning_hour?: number;
  midday_hour?: number;
  evening_hour?: number;
}) {
  const { updateAgentSettings } = await import("@/lib/agent/settings");
  return updateAgentSettings(input);
}

export async function agentGetDigSchedule() {
  const { getAgentSettings } = await import("@/lib/agent/settings");
  const s = await getAgentSettings();
  return {
    dig_hours: s.dig_hours,
    morning_hour: s.morning_hour,
    midday_hour: s.midday_hour,
    evening_hour: s.evening_hour,
    timezone: "Asia/Jerusalem",
    note: "1–6 dig slots per day. Change with update_dig_schedule({ dig_hours: [8,13,18,21] }).",
  };
}
