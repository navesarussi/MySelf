import type { Commitment } from "@/lib/types";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { addCommitment, setCommitmentStatus, deleteCommitment } from "./actions";
import { Trash2 } from "lucide-react";

export function CommitmentsSection({ commitments }: { commitments: Commitment[] }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">יומן התחייבויות</h2>
      <p className="mb-3 text-sm text-muted">
        התחייבות אחת קטנה וברורה לפעם הבאה — ובפתיחה הבאה, קודם כל לבדוק אם היא בוצעה.
      </p>

      <form action={addCommitment} className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
        <input type="text" name="text" placeholder="ההתחייבות שלי לפעם הבאה" required className={inputClass} />
        <input type="date" name="commitment_date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
        <SubmitButton>הוספה</SubmitButton>
      </form>

      {commitments.length === 0 ? (
        <EmptyState text="אין עדיין התחייבויות רשומות." />
      ) : (
        <div className="space-y-2">
          {commitments.map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  {new Date(c.commitment_date).toLocaleDateString("he-IL")}
                </span>
                <span className={c.status === "missed" ? "text-muted line-through" : ""}>{c.text}</span>
              </div>
              <div className="flex items-center gap-2">
                {(["pending", "done", "missed"] as const).map((s) => (
                  <form key={s} action={setCommitmentStatus}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value={s} />
                    <button type="submit">
                      <Badge tone={c.status === s ? (s === "done" ? "good" : s === "missed" ? "warn" : "accent") : "default"}>
                        {s === "pending" ? "ממתין" : s === "done" ? "בוצע" : "לא בוצע"}
                      </Badge>
                    </button>
                  </form>
                ))}
                <form action={deleteCommitment}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="p-1 text-muted hover:text-warn" title="מחיקה">
                    <Trash2 size={14} />
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
