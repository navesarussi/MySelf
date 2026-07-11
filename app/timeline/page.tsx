import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, SubmitButton, inputClass } from "@/components/ui";
import type { TimelineEvent } from "@/lib/types";
import type { LifePeriod } from "@/lib/life-periods";
import { addTimelineEvent, addLifePeriod } from "./actions";
import { TimelineBoard } from "./timeline-board";

export const revalidate = 30;

async function getEvents(): Promise<TimelineEvent[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("timeline_events")
    .select("*")
    .order("event_date", { ascending: false });
  return (data || []) as TimelineEvent[];
}

async function getPeriods(): Promise<LifePeriod[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("life_periods")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data || []) as LifePeriod[];
}

export default async function TimelinePage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="ציר זמן" subtitle="תקופות חופפות ואבני דרך" />
        <DbWarning />
      </>
    );
  }

  const [events, periods] = await Promise.all([getEvents(), getPeriods()]);

  return (
    <>
      <PageHeader
        title="ציר זמן"
        subtitle="כרונולוגי · ציר ויזואלי עם זום · תקופות חופפות"
      />

      <form action={addTimelineEvent} className="card mb-4 grid gap-3 p-4 sm:grid-cols-2">
        <input type="date" name="event_date" required className={inputClass} />
        <input type="text" name="category" placeholder="קטגוריה (למשל: משפחה, צבא, טיול)" className={inputClass} />
        <input type="text" name="title" placeholder="כותרת האירוע" required className={`${inputClass} sm:col-span-2`} />
        <textarea name="description" placeholder="תיאור (אופציונלי)" rows={2} className={`${inputClass} sm:col-span-2`} />
        <div className="sm:col-span-2">
          <SubmitButton>הוספת אירוע</SubmitButton>
        </div>
      </form>

      <details className="card mb-8 p-4">
        <summary className="cursor-pointer text-sm font-medium">הוספת תקופת חיים חדשה</summary>
        <form action={addLifePeriod} className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="text" name="title" placeholder="שם התקופה" required className={`${inputClass} sm:col-span-2`} />
          <input type="date" name="start_date" required className={inputClass} />
          <input type="date" name="end_date" className={inputClass} title="ריק = נמשך עד היום" />
          <input type="color" name="color" defaultValue="#7dd3c0" className="h-10 w-full rounded-lg border bg-transparent" />
          <div className="sm:col-span-2">
            <SubmitButton>הוספת תקופה</SubmitButton>
          </div>
        </form>
      </details>

      <TimelineBoard events={events} periods={periods} />
    </>
  );
}
