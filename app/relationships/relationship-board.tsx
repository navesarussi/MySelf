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
import { RelationshipEditForm } from "./relationship-edit-form";
import { Trash2, MessageCircle } from "lucide-react";
import { whatsappUrl } from "@/lib/integrations/phone";

export function RelationshipForm({
  projects,
  fixedProjectId,
  defaultProjectId,
  defaultOpen = false,
  className = "mb-8",
}: {
  projects: { id: string; name: string }[];
  fixedProjectId?: string;
  defaultProjectId?: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { t } = useTranslations();
  const selectedId = fixedProjectId ?? defaultProjectId ?? projects[0]?.id;

  return (
    <AddFormToggle
      label={t("relationships.addContact")}
      defaultOpen={defaultOpen}
      className={className}
      id="add-form-contact"
    >
      <form action={addRelationship} className="card grid gap-2 p-3 sm:grid-cols-2">
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
  projects = [],
  showProjectBadge = true,
  showProjectSelect = true,
  today = new Date(),
}: {
  r: Relationship;
  projects?: { id: string; name: string }[];
  showProjectBadge?: boolean;
  showProjectSelect?: boolean;
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
    <div className="card flex flex-col gap-1.5 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium">{r.name}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px]">
            {showProjectBadge && r.project_name && <Badge>{r.project_name}</Badge>}
            {neverContacted ? (
              <Badge tone="warn">{t("relationships.noContactLogged")}</Badge>
            ) : (
              <Badge tone={overdue ? "warn" : "default"}>
                {t("relationships.lastContactDays", { days: daysSince })}
              </Badge>
            )}
          </div>
        </div>
        <form action={deleteRelationship}>
          <input type="hidden" name="id" value={r.id} />
          <button className="rounded-md p-1 text-muted hover:text-warn" title={t("common.delete")}>
            <Trash2 size={13} />
          </button>
        </form>
      </div>

      {projects.length > 0 && (
        <RelationshipEditForm
          relationship={r}
          projects={projects}
          showProjectSelect={showProjectSelect}
        />
      )}

      <NotesForm id={r.id} defaultNotes={r.notes || ""} action={updateRelationshipNotes} />

      <div className="flex flex-wrap gap-1 border-t border-border/30 pt-1.5">
        <form action={markContactedToday}>
          <input type="hidden" name="id" value={r.id} />
          <button className="flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent hover:bg-accent/25">
            <MessageCircle size={11} /> {t("relationships.contactedToday")}
          </button>
        </form>
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
      </div>
    </div>
  );
}

export function RelationshipList({
  relationships,
  projects = [],
  showProjectBadge = true,
  showProjectSelect = true,
}: {
  relationships: Relationship[];
  projects?: { id: string; name: string }[];
  showProjectBadge?: boolean;
  showProjectSelect?: boolean;
}) {
  const { t } = useTranslations();

  if (relationships.length === 0) {
    return <EmptyState text={t("relationships.empty")} />;
  }

  const today = new Date();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {relationships.map((r) => (
        <RelationshipCard
          key={r.id}
          r={r}
          projects={projects}
          showProjectBadge={showProjectBadge}
          showProjectSelect={showProjectSelect}
          today={today}
        />
      ))}
    </div>
  );
}
