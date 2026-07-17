"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Relationship } from "@/lib/types";
import { inputClass } from "@/components/ui";
import { updateRelationship } from "./actions";
import { useTranslations } from "@/components/locale-provider";

export function RelationshipEditForm({
  relationship,
  projects,
  showProjectSelect = true,
  onClose,
}: {
  relationship: Relationship;
  projects: { id: string; name: string }[];
  showProjectSelect?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { t } = useTranslations();
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await updateRelationship(fd);
      onClose();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-1.5 rounded-lg border border-border/60 bg-bg/40 p-2.5 text-xs"
    >
      <input type="hidden" name="id" value={relationship.id} />
      <input
        type="text"
        name="name"
        defaultValue={relationship.name}
        required
        className={inputClass}
        placeholder={t("relationships.namePlaceholder")}
      />
      <input
        type="text"
        name="group_name"
        defaultValue={relationship.group_name || ""}
        placeholder={t("relationships.groupPlaceholder")}
        className={inputClass}
      />
      {showProjectSelect ? (
        <select name="project_id" defaultValue={relationship.project_id} className={inputClass}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="project_id" value={relationship.project_id} />
      )}
      <input
        type="number"
        name="reminder_days"
        defaultValue={relationship.reminder_days ?? ""}
        placeholder={t("relationships.reminderPlaceholder")}
        className={inputClass}
      />
      <input
        type="text"
        name="phone"
        defaultValue={relationship.phone || ""}
        placeholder={t("relationships.phonePlaceholder")}
        className={inputClass}
      />
      <textarea
        name="notes"
        defaultValue={relationship.notes || ""}
        placeholder={t("relationships.notesPlaceholder")}
        rows={2}
        className={inputClass}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-2.5 py-1 font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("common.saving") : t("relationships.saveChanges")}
        </button>
        <button type="button" onClick={onClose} className="rounded-lg px-2.5 py-1 text-muted hover:text-ink">
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
