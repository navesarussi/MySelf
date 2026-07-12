import type { Commitment } from "@/lib/types";
import { formatLocaleDate, getTranslations } from "@/lib/i18n";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { addCommitment, setCommitmentStatus, deleteCommitment } from "./actions";
import { Trash2 } from "lucide-react";

export async function CommitmentsSection({
  commitments,
  defaultOpen = false,
}: {
  commitments: Commitment[];
  defaultOpen?: boolean;
}) {
  const { locale, t } = await getTranslations();

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{t("goals.commitmentsTitle")}</h2>
      <p className="mb-3 text-sm text-muted">{t("goals.commitmentsHint")}</p>

      <AddFormToggle
        label={t("addMenu.commitment")}
        defaultOpen={defaultOpen}
        className="mb-4"
        id="add-form-commitment"
      >
        <form action={addCommitment} className="card grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto]">
          <input type="text" name="text" placeholder={t("goals.commitmentPlaceholder")} required className={inputClass} />
          <input type="date" name="commitment_date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
          <SubmitButton>{t("common.add")}</SubmitButton>
        </form>
      </AddFormToggle>

      {commitments.length === 0 ? (
        <EmptyState text={t("goals.noCommitments")} />
      ) : (
        <div className="space-y-2">
          {commitments.map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center justify-between gap-2 p-2.5">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  {formatLocaleDate(locale, c.commitment_date)}
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
                        {s === "pending" ? t("common.pending") : s === "done" ? t("common.done") : t("common.missed")}
                      </Badge>
                    </button>
                  </form>
                ))}
                <form action={deleteCommitment}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="p-1 text-muted hover:text-warn" title={t("common.delete")}>
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
