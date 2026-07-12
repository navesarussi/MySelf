import { Badge } from "@/components/ui";
import { formatLocaleDate, getTranslations } from "@/lib/i18n";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { updateTaskStatus } from "@/app/tasks/actions";

function priorityTone(p: TaskPriority): "warn" | "accent" | "default" {
  if (p === "high") return "warn";
  if (p === "medium") return "accent";
  return "default";
}

export async function HomeTaskRow({ task }: { task: Task }) {
  const { t, locale } = await getTranslations();

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

  return (
    <li className="rounded-lg bg-border/20 px-2.5 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">{task.title}</span>
            {task.project_name && <Badge>{task.project_name}</Badge>}
            <Badge tone={priorityTone(task.priority)}>{priorityLabel[task.priority]}</Badge>
          </div>
          {task.due_date && (
            <p className="mt-0.5 text-xs text-muted">
              {t("common.due")}: {formatLocaleDate(locale, task.due_date)}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
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
      </div>
    </li>
  );
}
