import { getSupabase } from "@/lib/supabase";
import { normalizeReportTime } from "@/lib/habit-stats";
import { parseMinZoom } from "@/lib/timeline-zoom";

export async function agentCreateHabit(input: {
  name: string;
  kind?: "build" | "quit";
  target_note?: string | null;
  report_time?: string | null;
}) {
  const { data, error } = await getSupabase()
    .from("habits")
    .insert({
      name: input.name.trim(),
      kind: input.kind === "quit" ? "quit" : "build",
      target_note: input.target_note ?? null,
      report_time: normalizeReportTime(input.report_time),
    })
    .select()
    .single();
  if (error) throw new Error("habit_create_failed");
  return data;
}

export async function agentUpdateHabit(
  id: string,
  patch: {
    name?: string;
    kind?: "build" | "quit";
    target_note?: string | null;
    report_time?: string | null;
    archived?: boolean;
  }
) {
  const body: Record<string, unknown> = {};
  if (patch.name) body.name = patch.name.trim();
  if (patch.kind) body.kind = patch.kind;
  if (patch.target_note !== undefined) body.target_note = patch.target_note;
  if (patch.report_time !== undefined) body.report_time = normalizeReportTime(patch.report_time);
  if (patch.archived !== undefined) body.archived = patch.archived;
  const { data, error } = await getSupabase().from("habits").update(body).eq("id", id).select().single();
  if (error) throw new Error("habit_update_failed");
  return data;
}

export async function agentCreateGoal(input: {
  title: string;
  category?: string | null;
  horizon?: string | null;
  first_step?: string | null;
  definition_of_done?: string | null;
}) {
  const { data, error } = await getSupabase()
    .from("goals")
    .insert({
      title: input.title.trim(),
      category: input.category ?? null,
      horizon: input.horizon ?? null,
      first_step: input.first_step ?? null,
      definition_of_done: input.definition_of_done ?? null,
    })
    .select()
    .single();
  if (error) throw new Error("goal_create_failed");
  return data;
}

export async function agentListLibrary(filters?: { q?: string; category?: string; limit?: number }) {
  let query = getSupabase()
    .from("content_entries")
    .select("id, title, category, body, tags, updated_at")
    .order("updated_at", { ascending: false });
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.q) {
    const pattern = `%${filters.q}%`;
    query = query.or(`title.ilike.${pattern},body.ilike.${pattern}`);
  }
  const { data, error } = await query.limit(filters?.limit ?? 20);
  if (error) throw new Error("library_list_failed");
  return data || [];
}

export async function agentCreateLibraryEntry(input: {
  title: string;
  body: string;
  category?: string;
  tags?: string[];
}) {
  const { data, error } = await getSupabase()
    .from("content_entries")
    .insert({
      title: input.title.trim(),
      body: input.body.trim(),
      category: input.category?.trim() || "כללי",
      tags: input.tags ?? [],
    })
    .select()
    .single();
  if (error) throw new Error("library_create_failed");
  return data;
}

export async function agentUpdateLibraryEntry(
  id: string,
  patch: { title?: string; body?: string; category?: string; tags?: string[] }
) {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title) body.title = patch.title.trim();
  if (patch.body) body.body = patch.body.trim();
  if (patch.category) body.category = patch.category.trim();
  if (patch.tags) body.tags = patch.tags;
  const { data, error } = await getSupabase()
    .from("content_entries")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("library_update_failed");
  return data;
}

export async function agentListEvents(filters?: { from?: string; to?: string; limit?: number }) {
  let query = getSupabase()
    .from("timeline_events")
    .select("id, title, event_date, event_time, description, category, source")
    .is("hidden_at", null)
    .order("event_date", { ascending: false });
  if (filters?.from) query = query.gte("event_date", filters.from);
  if (filters?.to) query = query.lte("event_date", filters.to);
  const { data, error } = await query.limit(filters?.limit ?? 30);
  if (error) throw new Error("events_list_failed");
  return data || [];
}

export async function agentCreateEvent(input: {
  title: string;
  event_date: string;
  event_time?: string | null;
  description?: string | null;
  category?: string | null;
}) {
  const { data, error } = await getSupabase()
    .from("timeline_events")
    .insert({
      title: input.title.trim(),
      event_date: input.event_date,
      event_time: input.event_time ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
      min_zoom: parseMinZoom(null),
      source: "manual",
    })
    .select()
    .single();
  if (error) throw new Error("event_create_failed");
  return data;
}

export async function agentUpdateEvent(
  id: string,
  patch: {
    title?: string;
    event_date?: string;
    event_time?: string | null;
    description?: string | null;
    category?: string | null;
  }
) {
  const { data: existing, error: fetchErr } = await getSupabase()
    .from("timeline_events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !existing) throw new Error("event_not_found");

  const title = patch.title?.trim() ?? existing.title;
  const event_date = patch.event_date ?? existing.event_date;
  const event_time = patch.event_time !== undefined ? patch.event_time : existing.event_time;
  const description = patch.description !== undefined ? patch.description : existing.description;

  const body =
    existing.source === "google_calendar"
      ? {
          event_date,
          event_time,
          title_override: title === existing.title ? null : title,
          description_override:
            description === (existing.description || null) ? null : description,
        }
      : {
          title,
          event_date,
          event_time,
          description,
          category: patch.category !== undefined ? patch.category : existing.category,
        };

  const { data, error } = await getSupabase()
    .from("timeline_events")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("event_update_failed");
  return data;
}

export async function agentListPeriods() {
  const { data, error } = await getSupabase()
    .from("life_periods")
    .select("id, title, start_date, end_date, color, kind, sort_order")
    .order("sort_order");
  if (error) throw new Error("periods_list_failed");
  return data || [];
}

export async function agentCreatePeriod(input: {
  title: string;
  start_date: string;
  end_date?: string | null;
  color?: string;
  kind?: string;
}) {
  const { data, error } = await getSupabase()
    .from("life_periods")
    .insert({
      title: input.title.trim(),
      start_date: input.start_date,
      end_date: input.end_date ?? null,
      color: input.color || "#7dd3c0",
      kind: input.kind || "period",
      sort_order: 100,
    })
    .select()
    .single();
  if (error) throw new Error("period_create_failed");
  return data;
}

export async function agentUpdatePeriod(
  id: string,
  patch: {
    title?: string;
    start_date?: string;
    end_date?: string | null;
    color?: string;
    kind?: string;
  }
) {
  const body: Record<string, unknown> = {};
  if (patch.title) body.title = patch.title.trim();
  if (patch.start_date) body.start_date = patch.start_date;
  if (patch.end_date !== undefined) body.end_date = patch.end_date;
  if (patch.color) body.color = patch.color;
  if (patch.kind) body.kind = patch.kind;
  const { data, error } = await getSupabase()
    .from("life_periods")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("period_update_failed");
  return data;
}
