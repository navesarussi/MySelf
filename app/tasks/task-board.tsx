"use client";

import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { formatLocaleDate } from "@/lib/i18n/core";
import { useTranslations } from "@/components/locale-provider";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { addTask, updateTaskStatus, deleteTask } from "./actions";
import { Trash2 } from "lucide-react";

function priorityTone(p: TaskPriority): "warn" | "accent" | "default" {
  if (p === "high") return "warn";
  if (p === "medium") return "accent";
  return "default";
}

export function TaskForm({
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
      label={t("tasks.addTask")}
      defaultOpen={defaultOpen}
      className="mb-6"
      id="add-form-task"
    >
      <form action={addTask} className="card grid gap-3 p-4 sm:grid-cols-2">
      <input type="text" name="title" placeholder={t("tasks.titlePlaceholder")} required className={`${inputClass} sm:col-span-2`} />
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
      <select name="priority" className={inputClass} defaultValue="medium">
        <option value="high">{t("tasks.priorityHigh")}</option>
        <option value="medium">{t("tasks.priorityMedium")}</option>
        <option value="low">{t("tasks.priorityLow")}</option>
      </select>
      <select name="status" className={inputClass} defaultValue="open">
        <option value="open">{t("common.open")}</option>
        <option value="in_progress">{t("common.inProgress")}</option>
        <option value="done">{t("common.done")}</option>
      </select>
      <input type="date" name="due_date" className={inputClass} />
      <textarea name="notes" placeholder={t("tasks.notesPlaceholder")} rows={2} className={`${inputClass} sm:col-span-2`} />
      <div className="sm:col-span-2">
        <SubmitButton>{t("tasks.addTask")}</SubmitButton>
      </div>
    </form>
    </AddFormToggle>
  );
}

export function TaskList({
  tasks,
  showProjectBadge = true,
}: {
  tasks: Task[];
  showProjectBadge?: boolean;
}) {
  const { t, locale } = useTranslations();

  const priorityLabel: Record<TaskPriority, string> = {
    high: t("common.high"),
    medium: t("common.medium"),
    low: t("common.low"),
  };

  const statusLabel: Record<TaskStatus, string> = {
    open: t("common.open"),
    in_progress: t("common.inProgress"),
    done: t("common.done"),
  };

  if (tasks.length === 0) {
    return <EmptyState text={t("tasks.empty")} />;
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div key={task.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={task.status === "done" ? "text-muted line-through" : "font-medium"}>
                {task.title}
              </span>
              {showProjectBadge && task.project_name && <Badge>{task.project_name}</Badge>}
              <Badge tone={priorityTone(task.priority)}>{priorityLabel[task.priority]}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
              {task.due_date && (
                <span>{t("common.due")}: {formatLocaleDate(locale, task.due_date)}</span>
              )}
              {task.notes && <span className="truncate">{task.notes}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {(["open", "in_progress", "done"] as const).map((s) => (
              <form key={s} action={updateTaskStatus}>
                <input type="hidden" name="id" value={task.id} />
                <input type="hidden" name="status" value={s} />
                <button type="submit">
                  <Badge tone={task.status === s ? (s === "done" ? "good" : "accent") : "default"}>
                    {statusLabel[s]}
                  </Badge>
                </button>
              </form>
            ))}
            <form action={deleteTask}>
              <input type="hidden" name="id" value={task.id} />
              <button className="p-1.5 text-muted hover:text-warn" title={t("common.delete")}>
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
