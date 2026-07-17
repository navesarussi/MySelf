import { differenceInCalendarDays } from "date-fns";
import { Badge } from "@/components/ui";
import { whatsappUrl } from "@/lib/integrations/phone";
import { getTranslations } from "@/lib/i18n";
import type { Relationship } from "@/lib/types";
import { markContactedToday } from "@/app/legacy/relationships/actions";
import { MessageCircle } from "lucide-react";

export async function HomeRelationshipRow({
  relationship: r,
  today,
}: {
  relationship: Relationship;
  today: Date;
}) {
  const { t } = await getTranslations();
  const daysSince = r.last_contact_date
    ? differenceInCalendarDays(today, new Date(r.last_contact_date))
    : null;
  const overdue =
    r.reminder_days != null && daysSince != null && daysSince >= r.reminder_days;
  const neverContacted = daysSince === null;
  const wa = r.phone ? whatsappUrl(r.phone) : null;

  return (
    <li className="rounded-lg bg-border/20 px-2.5 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm font-medium">{r.name}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {neverContacted ? (
              <Badge tone="warn">{t("relationships.noContactLogged")}</Badge>
            ) : (
              <Badge tone={overdue ? "warn" : "default"}>
                {t("relationships.lastContactDays", { days: daysSince })}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md bg-good/15 px-2 py-0.5 text-[11px] font-medium text-good hover:bg-good/25"
            >
              <MessageCircle size={11} /> {t("common.openWhatsapp")}
            </a>
          )}
          <form action={markContactedToday}>
            <input type="hidden" name="id" value={r.id} />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25"
            >
              <MessageCircle size={11} /> {t("relationships.contactedToday")}
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
