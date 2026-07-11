import { differenceInCalendarDays } from "date-fns";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, EmptyState, Badge, SubmitButton, inputClass } from "@/components/ui";
import type { Relationship } from "@/lib/types";
import { addRelationship, markContactedToday, updateRelationshipNotes, deleteRelationship } from "./actions";
import { NotesForm } from "./notes-form";
import { Trash2, MessageCircle } from "lucide-react";

export const revalidate = 30;

function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

export default async function RelationshipsPage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="ניהול קשרים" />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();
  const { data } = await supabase.from("relationships").select("*").order("name");
  const relationships = (data as Relationship[]) || [];
  const grouped = groupBy(relationships, (r) => r.group_name || "אחר");
  const today = new Date();

  return (
    <>
      <PageHeader title="ניהול קשרים" subtitle="משפחה, חברים ובת/בן זוג — מי מחכה לשמוע ממך" />

      <form action={addRelationship} className="card mb-8 grid gap-3 p-4 sm:grid-cols-2">
        <input type="text" name="name" placeholder="שם" required className={inputClass} />
        <input type="text" name="group_name" placeholder="קבוצה (משפחה / יישוב / תיכון / מכינה / צבא / זוגיות)" className={inputClass} />
        <input type="number" name="reminder_days" placeholder="תזכורת כל כמה ימים (אופציונלי)" className={inputClass} />
        <input type="text" name="notes" placeholder="הערה" className={inputClass} />
        <div className="sm:col-span-2">
          <SubmitButton>הוספת איש קשר</SubmitButton>
        </div>
      </form>

      {relationships.length === 0 ? (
        <EmptyState text="אין עדיין אנשי קשר. הוסף את הראשון למעלה." />
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([group, people]) => (
            <div key={group}>
              <h2 className="mb-3 text-sm font-semibold text-muted">{group}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {people.map((r) => {
                  const daysSince = r.last_contact_date
                    ? differenceInCalendarDays(today, new Date(r.last_contact_date))
                    : null;
                  const overdue = r.reminder_days != null && daysSince != null && daysSince >= r.reminder_days;
                  const neverContacted = daysSince === null;

                  return (
                    <div key={r.id} className="card p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium">{r.name}</span>
                        <form action={deleteRelationship}>
                          <input type="hidden" name="id" value={r.id} />
                          <button className="p-1 text-muted hover:text-warn" title="מחיקה">
                            <Trash2 size={14} />
                          </button>
                        </form>
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        {neverContacted ? (
                          <Badge tone="warn">אין עדיין תיעוד קשר</Badge>
                        ) : (
                          <Badge tone={overdue ? "warn" : "default"}>
                            קשר אחרון לפני {daysSince} ימים
                          </Badge>
                        )}
                      </div>

                      <NotesForm id={r.id} defaultNotes={r.notes || ""} action={updateRelationshipNotes} />

                      <form action={markContactedToday} className="mt-2">
                        <input type="hidden" name="id" value={r.id} />
                        <button className="flex items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/25">
                          <MessageCircle size={13} /> יצרתי קשר היום
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
