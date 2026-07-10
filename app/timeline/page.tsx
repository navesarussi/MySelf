import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, EmptyState, Badge, SubmitButton, inputClass } from "@/components/ui";
import type { TimelineEvent } from "@/lib/types";
import { addTimelineEvent, deleteTimelineEvent } from "./actions";
import { Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

async function getEvents(): Promise<TimelineEvent[]> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("timeline_events")
    .select("*")
    .order("event_date", { ascending: false });
  return data || [];
}

export default async function TimelinePage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="ציר זמן" subtitle="האירועים החשובים בחיים שלך" />
        <DbWarning />
      </>
    );
  }

  const events = await getEvents();

  return (
    <>
      <PageHeader title="ציר זמן" subtitle="האירועים החשובים בחיים שלך" />

      <form action={addTimelineEvent} className="card mb-8 grid gap-3 p-4 sm:grid-cols-2">
        <input type="date" name="event_date" required className={inputClass} />
        <input type="text" name="category" placeholder="קטגוריה (למשל: משפחה, צבא, טיול)" className={inputClass} />
        <input type="text" name="title" placeholder="כותרת האירוע" required className={`${inputClass} sm:col-span-2`} />
        <textarea name="description" placeholder="תיאור (אופציונלי)" rows={2} className={`${inputClass} sm:col-span-2`} />
        <div className="sm:col-span-2">
          <SubmitButton>הוספת אירוע</SubmitButton>
        </div>
      </form>

      {events.length === 0 ? (
        <EmptyState text="אין עדיין אירועים בציר הזמן. הוסף את הראשון למעלה." />
      ) : (
        <ol className="relative space-y-6 border-e-2 border-border pe-6">
          {events.map((ev) => (
            <li key={ev.id} className="relative">
              <span className="absolute -end-[31px] top-1.5 h-3 w-3 rounded-full bg-accent" />
              <div className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted">
                      {new Date(ev.event_date).toLocaleDateString("he-IL")}
                    </span>
                    {ev.category && <Badge tone="accent">{ev.category}</Badge>}
                  </div>
                  <form action={deleteTimelineEvent}>
                    <input type="hidden" name="id" value={ev.id} />
                    <button className="rounded-lg p-1.5 text-muted hover:text-warn" title="מחיקה">
                      <Trash2 size={16} />
                    </button>
                  </form>
                </div>
                <h3 className="mt-2 font-semibold">{ev.title}</h3>
                {ev.description && <p className="mt-1 text-sm text-muted">{ev.description}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
