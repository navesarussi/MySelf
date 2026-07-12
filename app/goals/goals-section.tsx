import type { Goal } from "@/lib/types";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { addGoal, toggleGoalStatus, deleteGoal } from "./actions";
import { Target, Trash2, RotateCcw } from "lucide-react";

function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

export function GoalsSection({ goals }: { goals: Goal[] }) {
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");
  const grouped = groupBy(active, (g) => g.category || "כללי");

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-bold">מטרות וחלומות</h2>

      {active.length === 0 ? (
        <EmptyState text="אין עדיין יעדים פעילים." />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([category, items]) => (
            <div key={category}>
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted">
                <Target size={14} /> {category}
              </h3>
              <div className="space-y-2">
                {items.map((g) => (
                  <div key={g.id} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium">{g.title}</h4>
                      <div className="flex shrink-0 items-center gap-1">
                        <form action={toggleGoalStatus}>
                          <input type="hidden" name="id" value={g.id} />
                          <input type="hidden" name="status" value={g.status} />
                          <button
                            className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-medium text-good hover:opacity-80"
                            title="סמן כהושג"
                          >
                            ✓ בוצע
                          </button>
                        </form>
                        <form action={deleteGoal}>
                          <input type="hidden" name="id" value={g.id} />
                          <button className="p-1.5 text-muted hover:text-warn" title="מחיקה">
                            <Trash2 size={14} />
                          </button>
                        </form>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                      {g.horizon && <Badge>אופק: {g.horizon}</Badge>}
                    </div>
                    <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      {g.first_step && (
                        <p>
                          <span className="text-muted">צעד ראשון: </span>
                          {g.first_step}
                        </p>
                      )}
                      {g.definition_of_done && (
                        <p>
                          <span className="text-muted">בוצע: </span>
                          {g.definition_of_done}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted">+ הוספת יעד/חלום חדש</summary>
        <form action={addGoal} className="card mt-3 grid gap-3 p-4 sm:grid-cols-2">
          <input type="text" name="title" placeholder="כותרת היעד" required className={`${inputClass} sm:col-span-2`} />
          <input type="text" name="category" placeholder="קטגוריה" className={inputClass} />
          <input type="text" name="horizon" placeholder="אופק זמן" className={inputClass} />
          <input type="text" name="first_step" placeholder="צעד ראשון" className={inputClass} />
          <input type="text" name="definition_of_done" placeholder="הגדרת 'בוצע'" className={inputClass} />
          <div className="sm:col-span-2">
            <SubmitButton>הוספה</SubmitButton>
          </div>
        </form>
      </details>

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            ✓ חלומות שהוגשמו ({done.length})
          </summary>
          <div className="mt-3 space-y-2">
            {done.map((g) => (
              <div key={g.id} className="card flex items-center justify-between p-3 text-sm">
                <span>{g.title}</span>
                <form action={toggleGoalStatus}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="status" value={g.status} />
                  <button className="flex items-center gap-1 text-muted hover:text-ink" title="החזר לפעיל">
                    <RotateCcw size={13} />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
