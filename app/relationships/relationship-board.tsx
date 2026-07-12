"use client";

import { differenceInCalendarDays } from "date-fns";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { useTranslations } from "@/components/locale-provider";
import type { Relationship } from "@/lib/types";
import {
  addRelationship,
  markContactedToday,
  updateRelationshipNotes,
  deleteRelationship,
} from "./actions";
import { NotesForm } from "./notes-form";
import { Trash2, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/integrations/phone";

export function RelationshipForm({
  projects,
  fixedProjectId,
  defaultProjectId,
  defaultOpen = false,
}: {
  projects: { id: string; name: string }[];
  fixedProjectId?: string;
  defaultProjectId?: string;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslations();
  const selectedId = fixedProjectId ?? defaultProjectId ?? projects[0]?.id;

  return (
    <AddFormToggle
      label={t("relationships.addContact")}
      defaultOpen={defaultOpen}
      className="mb-8"
      id="add-form-contact"
    >
      <form action={addRelationship} className="card grid gap-3 p-4 sm:grid-cols-2">
      <input type="text" name="name" placeholder={t("relationships.namePlaceholder")} required className={inputClass} />
      <input
        type="text"
        name="group_name"
        placeholder={t("relationships.groupPlaceholder")}
        className={inputClass}
      />
      {fixedProjectId ? (
        <input type="hidden" name="project_id" value={fixedProjectId} />
      ) : (
        <select name="project_id" className={inputClass} defaultValue={selectedId}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
      <input
        type="number"
        name="reminder_days"
        placeholder={t("relationships.reminderPlaceholder")}
        className={inputClass}
      />
      <input type="text" name="phone" placeholder={t("relationships.phonePlaceholder")} className={inputClass} />
      <input type="text" name="notes" placeholder={t("relationships.notePlaceholder")} className={inputClass} />
      <div className="sm:col-span-2">
        <SubmitButton>{t("relationships.addContact")}</SubmitButton>
      </div>
    </form>
    </AddFormToggle>
  );
}

export function RelationshipCard({
  r,
  showProjectBadge = true,
  today = new Date(),
}: {
  r: Relationship;
  showProjectBadge?: boolean;
  today?: Date;
}) {
  const { t } = useTranslations();
  const daysSince = r.last_contact_date
    ? differenceInCalendarDays(today, new Date(r.last_contact_date))
    : null;
  const overdue = r.reminder_days != null && daysSince != null && daysSince >= r.reminder_days;
  const neverContacted = daysSince === null;
  const wa = r.phone ? whatsappUrl(r.phone) : null;

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{r.name}</span>
        <form action={deleteRelationship}>
          <input type="hidden" name="id" value={r.id} />
          <button className="p-1 text-muted hover:text-warn" title={t("common.delete")}>
            <Trash2 size={14} />
          </button>
        </form>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        {showProjectBadge && r.project_name && <Badge>{r.project_name}</Badge>}
        {neverContacted ? (
          <Badge tone="warn">{t("relationships.noContactLogged")}</Badge>
        ) : (
          <Badge tone={overdue ? "warn" : "default"}>
            {t("relationships.lastContactDays", { days: daysSince })}
          </Badge>
        )}
      </div>

      <NotesForm id={r.id} defaultNotes={r.notes || ""} action={updateRelationshipNotes} />

      <div className="mt-2 flex flex-wrap gap-2">
        <form action={markContactedToday}>
          <input type="hidden" name="id" value={r.id} />
          <button className="flex items-center gap-1 rounded-lg bg-accent/15 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/25">
            <MessageCircle size={13} /> {t("relationships.contactedToday")}
          </button>
        </form>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-lg bg-good/15 px-2.5 py-1.5 text-xs font-medium text-good hover:bg-good/25"
          >
            <MessageCircle size={13} /> {t("common.openWhatsapp")}
          </a>
        )}
      </div>
    </div>
  );
}

export function RelationshipList({
  relationships,
  showProjectBadge = true,
}: {
  relationships: Relationship[];
  showProjectBadge?: boolean;
}) {
  const { t } = useTranslations();

  if (relationships.length === 0) {
    return <EmptyState text={t("relationships.empty")} />;
  }

  const today = new Date();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {relationships.map((r) => (
        <RelationshipCard key={r.id} r={r} showProjectBadge={showProjectBadge} today={today} />
      ))}
    </div>
  );
}
