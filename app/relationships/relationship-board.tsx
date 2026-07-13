"use client";

import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { useTranslations } from "@/components/locale-provider";
import { formatLocaleDate } from "@/lib/i18n/core";
import type { Relationship } from "@/lib/types";
import {
  addRelationship,
  markContactedToday,
  deleteRelationship,
} from "./actions";
import { RelationshipEditForm } from "./relationship-edit-form";
import { Trash2, MessageCircle, Pencil, Search } from "lucide-react";
import { whatsappUrl } from "@/lib/integrations/phone";

function daysSinceContact(r: Relationship, today: Date): number | null {
  return r.last_contact_date
    ? differenceInCalendarDays(today, new Date(r.last_contact_date))
    : null;
}

export function RelationshipForm({
  projects,
  fixedProjectId,
  defaultProjectId,
  defaultOpen = false,
  className = "mt-6",
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
  const { t, locale } = useTranslations();
  const [editing, setEditing] = useState(false);
  const daysSince = daysSinceContact(r, today);
  const overdue = r.reminder_days != null && daysSince != null && daysSince >= r.reminder_days;
  const overdueBy =
    overdue && r.reminder_days != null && daysSince != null ? daysSince - r.reminder_days : null;
  const neverContacted = daysSince === null;
  const wa = r.phone ? whatsappUrl(r.phone) : null;

  return (
    <div className="card flex flex-col gap-1 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          <span className="truncate text-sm font-medium">{r.name}</span>
          {r.group_name && <Badge>{r.group_name}</Badge>}
          {showProjectBadge && r.project_name && <Badge>{r.project_name}</Badge>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-md p-1 text-muted hover:text-accent"
            title={t("relationships.editContact")}
            aria-expanded={editing}
          >
            <Pencil size={13} />
          </button>
          <form action={deleteRelationship}>
            <input type="hidden" name="id" value={r.id} />
            <button className="rounded-md p-1 text-muted hover:text-warn" title={t("common.delete")}>
              <Trash2 size={13} />
            </button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        {neverContacted ? (
          <Badge tone="warn">{t("relationships.noContactLogged")}</Badge>
        ) : (
          <>
            <Badge tone={overdue ? "warn" : "default"}>
              {t("relationships.lastContactDays", { days: daysSince })}
            </Badge>
            <span className="text-muted">{formatLocaleDate(locale, r.last_contact_date!)}</span>
            {overdueBy != null && (
              <span className="text-warn">{t("relationships.overdueBy", { days: overdueBy })}</span>
            )}
          </>
        )}
      </div>

      {r.notes && !editing && (
        <p className="line-clamp-2 text-[11px] leading-snug text-muted">{r.notes}</p>
      )}

      {editing && projects.length > 0 && (
        <RelationshipEditForm
          relationship={r}
          projects={projects}
          showProjectSelect={showProjectSelect}
          onClose={() => setEditing(false)}
        />
      )}

      <div className="flex flex-wrap gap-1 border-t border-border/30 pt-1">
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

type SortMode = "urgency" | "name" | "longestSince";

export function RelationshipsPanel({
  relationships,
  projects,
  defaultProjectId,
  defaultOpen = false,
  today: todayISO,
}: {
  relationships: Relationship[];
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  defaultOpen?: boolean;
  today: string;
}) {
  const { t } = useTranslations();
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [sort, setSort] = useState<SortMode>("urgency");
  const today = useMemo(() => new Date(todayISO), [todayISO]);

  const urgencyScore = (r: Relationship): number => {
    const days = daysSinceContact(r, today);
    if (r.reminder_days == null) return -Infinity;
    if (days == null) return Number.MAX_SAFE_INTEGER;
    return days - r.reminder_days;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = relationships.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (projectFilter && r.project_id !== projectFilter) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "he");
      if (sort === "longestSince") {
        const da = daysSinceContact(a, today) ?? Number.MAX_SAFE_INTEGER;
        const db = daysSinceContact(b, today) ?? Number.MAX_SAFE_INTEGER;
        if (db !== da) return db - da;
        return a.name.localeCompare(b.name, "he");
      }
      const diff = urgencyScore(b) - urgencyScore(a);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "he");
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationships, query, projectFilter, sort, today]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[10rem] flex-1">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("relationships.searchNamePlaceholder")}
            className={`${inputClass} ps-9`}
          />
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className={`${inputClass} w-auto`}
        >
          <option value="">{t("relationships.allProjects")}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className={`${inputClass} w-auto`}
        >
          <option value="urgency">{t("relationships.sortUrgency")}</option>
          <option value="longestSince">{t("relationships.sortLongestSince")}</option>
          <option value="name">{t("relationships.sortName")}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={t("relationships.noFilterResults")} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((r) => (
            <RelationshipCard key={r.id} r={r} projects={projects} today={today} />
          ))}
        </div>
      )}

      <RelationshipForm projects={projects} defaultProjectId={defaultProjectId} defaultOpen={defaultOpen} />
    </>
  );
}
