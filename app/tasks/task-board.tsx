"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { formatLocaleDate } from "@/lib/i18n/core";
import { useTranslations } from "@/components/locale-provider";
import { Badge, SubmitButton, EmptyState, inputClass, SearchInput, IconEditButton, IconDeleteButton } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { addTask, updateTaskStatus, deleteTask } from "./actions";
import { TaskEditForm } from "./task-edit-form";

function priorityTone(p: TaskPriority): "warn" | "accent" | "default" {
  if (p === "high") return "warn";
  if (p === "medium") return "accent";
  return "default";
}

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  open: "in_progress",
  in_progress: "done",
  done: "open",
};

export function TaskForm({
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
      label={t("tasks.addTask")}
      defaultOpen={defaultOpen}
      className={className}
      id="add-form-task"
    >
      <form action={addTask} className="card grid gap-2 p-3 sm:grid-cols-2">
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

export function TaskSearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslations();

  return (
    <div className="mb-4">
      <SearchInput value={value} onChange={onChange} placeholder={t("tasks.searchPlaceholder")} />
    </div>
  );
}

export function TasksPanel({
  tasks,
  projects,
  defaultProjectId,
  defaultOpen = false,
}: {
  tasks: Task[];
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
  defaultOpen?: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((task) => task.title.toLowerCase().includes(q));
  }, [tasks, query]);

  return (
    <>
      <TaskSearchBar value={query} onChange={setQuery} />
      <TaskList tasks={filtered} projects={projects} />
      <TaskForm projects={projects} defaultProjectId={defaultProjectId} defaultOpen={defaultOpen} />
    </>
  );
}

export function TaskList({
  tasks,
  projects = [],
  showProjectBadge = true,
  showProjectSelect = true,
}: {
  tasks: Task[];
  projects?: { id: string; name: string }[];
  showProjectBadge?: boolean;
  showProjectSelect?: boolean;
}) {
  const { t, locale } = useTranslations();
  const [editingId, setEditingId] = useState<string | null>(null);

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
        <div key={task.id} className="card p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
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
            <form action={updateTaskStatus}>
              <input type="hidden" name="id" value={task.id} />
              <input type="hidden" name="status" value={STATUS_CYCLE[task.status]} />
              <button type="submit" title={t("tasks.advanceStatus")}>
                <Badge tone={task.status === "done" ? "good" : "accent"}>
                  {statusLabel[task.status]}
                </Badge>
              </button>
            </form>
            <IconEditButton
              title={t("tasks.editTask")}
              aria-expanded={editingId === task.id}
              onClick={() => setEditingId(editingId === task.id ? null : task.id)}
            >
              <Pencil size={14} />
            </IconEditButton>
            <form action={deleteTask}>
              <input type="hidden" name="id" value={task.id} />
              <IconDeleteButton type="submit" title={t("common.delete")}>
                <Trash2 size={14} />
              </IconDeleteButton>
            </form>
          </div>
          </div>
          {editingId === task.id && (
            <TaskEditForm
              task={task}
              projects={projects}
              showProjectSelect={showProjectSelect}
              onClose={() => setEditingId(null)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
