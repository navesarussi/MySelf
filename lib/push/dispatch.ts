import { getSupabase } from "@/lib/supabase";
import { habitReportDay } from "@/lib/habit-stats";
import { filterDueRelationships } from "@/lib/relationships-due";
import { notifyUser } from "@/lib/push/notify";
import { jerusalemParts } from "@/lib/push/time";
import type { NotifyResult } from "@/lib/push/notify";

function jerusalemTodayDate(now = new Date()): Date {
  const { dayKey } = jerusalemParts(now);
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function dispatchRelationships(now = new Date()): Promise<NotifyResult | null> {
  const { data } = await getSupabase()
    .from("relationships")
    .select("id, name, last_contact_date, reminder_days");
  if (!data?.length) return null;

  const due = filterDueRelationships(
    data as { name: string; last_contact_date: string | null; reminder_days: number | null }[],
    jerusalemTodayDate(now)
  );
  if (!due.length) return null;

  const names = due.slice(0, 3).map((r) => r.name).join(", ");
  const extra = due.length > 3 ? ` ועוד ${due.length - 3}` : "";
  return notifyUser(
    "relationships",
    {
      title: "קשרים שמחכים",
      body: due.length === 1
        ? `כדאי ליצור קשר עם ${due[0].name}`
        : `${due.length} אנשים מחכים לשיחה: ${names}${extra}`,
      data: { screen: "/relationships", type: "relationships" },
    },
    "daily"
  );
}

export async function dispatchHabits(now = new Date()): Promise<NotifyResult | null> {
  const { data } = await getSupabase()
    .from("habits")
    .select("id, name, report_time, last_checked_on, archived")
    .eq("archived", false);
  if (!data?.length) return null;

  const pending = data.filter((h) => {
    const day = habitReportDay(
      (h as { report_time?: string | null }).report_time,
      now
    );
    return (h as { last_checked_on: string | null }).last_checked_on !== day;
  });
  if (!pending.length) return null;

  const { hour } = jerusalemParts(now);
  // Remind once per habit window around morning/afternoon — hourly cron, dedup per day
  if (hour < 8 || hour > 21) return null;

  const names = pending.slice(0, 3).map((h) => (h as { name: string }).name).join(", ");
  return notifyUser(
    "habits",
    {
      title: "הרגלים לדיווח",
      body:
        pending.length === 1
          ? `עדיין לא דיווחת על ${pending[0].name as string}`
          : `${pending.length} הרגלים מחכים: ${names}`,
      data: { screen: "/habits", type: "habits" },
    },
    "daily"
  );
}

export async function dispatchTasks(now = new Date()): Promise<NotifyResult | null> {
  const { dayKey } = jerusalemParts(now);
  const { data } = await getSupabase()
    .from("tasks")
    .select("id, title, due_date, status")
    .not("due_date", "is", null)
    .neq("status", "done")
    .lte("due_date", dayKey);
  if (!data?.length) return null;

  const titles = data.slice(0, 3).map((t) => (t as { title: string }).title).join(", ");
  return notifyUser(
    "tasks",
    {
      title: "משימות לטיפול",
      body:
        data.length === 1
          ? `משימה ליום: ${(data[0] as { title: string }).title}`
          : `${data.length} משימות עם דדליין: ${titles}`,
      data: { screen: "/tasks", type: "tasks" },
    },
    "daily"
  );
}

export async function dispatchTimeline(now = new Date()): Promise<NotifyResult | null> {
  const { dayKey } = jerusalemParts(now);
  const { data } = await getSupabase()
    .from("timeline_events")
    .select("id, title, event_date, hidden_at")
    .eq("event_date", dayKey)
    .is("hidden_at", null);
  if (!data?.length) return null;

  const titles = data.slice(0, 3).map((e) => (e as { title: string }).title).join(", ");
  return notifyUser(
    "timeline",
    {
      title: "אירועים להיום",
      body:
        data.length === 1
          ? (data[0] as { title: string }).title
          : `${data.length} אירועים: ${titles}`,
      data: { screen: "/timeline", type: "timeline" },
    },
    "daily"
  );
}
