"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task } from "@/lib/types";
import { inputClass } from "@/components/ui";
import { updateTask } from "./actions";
import { useTranslations } from "@/components/locale-provider";

export function TaskEditForm({
  task,
  projects,
  showProjectSelect = true,
  onClose,
}: {
  task: Task;
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
      await updateTask(fd);
      onClose();
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-2 grid gap-1.5 rounded-lg border border-border/60 bg-bg/40 p-2.5 text-xs sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={task.id} />
      <input
        type="text"
        name="title"
        defaultValue={task.title}
        required
        className={`${inputClass} sm:col-span-2`}
        placeholder={t("tasks.titlePlaceholder")}
      />
      {showProjectSelect ? (
        <select name="project_id" defaultValue={task.project_id ?? ""} className={inputClass}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <input type="hidden" name="project_id" value={task.project_id ?? ""} />
      )}
      <select name="priority" defaultValue={task.priority} className={inputClass}>
        <option value="urgent">{t("common.urgent")}</option>
        <option value="high">{t("tasks.priorityHigh")}</option>
        <option value="medium">{t("tasks.priorityMedium")}</option>
        <option value="low">{t("tasks.priorityLow")}</option>
      </select>
      <select name="status" defaultValue={task.status} className={inputClass}>
        <option value="open">{t("common.open")}</option>
        <option value="in_progress">{t("common.inProgress")}</option>
        <option value="stuck">{t("common.stuck")}</option>
        <option value="review">{t("common.review")}</option>
        <option value="done">{t("common.done")}</option>
      </select>
      <input
        type="date"
        name="due_date"
        defaultValue={task.due_date || ""}
        className={inputClass}
      />
      <textarea
        name="notes"
        defaultValue={task.notes || ""}
        placeholder={t("tasks.notesPlaceholder")}
        rows={2}
        className={`${inputClass} sm:col-span-2`}
      />
      <div className="flex gap-2 sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-2.5 py-1 font-medium text-bg hover:opacity-90 disabled:opacity-50"
        >
          {pending ? t("common.saving") : t("tasks.saveChanges")}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2.5 py-1 text-muted hover:text-ink"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
