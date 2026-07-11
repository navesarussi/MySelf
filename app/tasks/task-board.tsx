import type { Task, TaskPriority, TaskStatus } from "@/lib/types";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { addTask, updateTaskStatus, deleteTask } from "./actions";
import { Trash2 } from "lucide-react";

const priorityLabel: Record<TaskPriority, string> = {
  high: "גבוהה",
  medium: "בינונית",
  low: "נמוכה",
};

const statusLabel: Record<TaskStatus, string> = {
  open: "פתוח",
  in_progress: "בתהליך",
  done: "בוצע",
};

function priorityTone(p: TaskPriority): "warn" | "accent" | "default" {
  if (p === "high") return "warn";
  if (p === "medium") return "accent";
  return "default";
}

export function TaskForm() {
  return (
    <form action={addTask} className="card mb-6 grid gap-3 p-4 sm:grid-cols-2">
      <input type="text" name="title" placeholder="כותרת המשימה" required className={`${inputClass} sm:col-span-2`} />
      <select name="project" className={inputClass} defaultValue="אישי">
        {["Digital Scale", "Glowy", "KupaPay", "אישי", "אחר"].map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <select name="priority" className={inputClass} defaultValue="medium">
        <option value="high">עדיפות גבוהה</option>
        <option value="medium">עדיפות בינונית</option>
        <option value="low">עדיפות נמוכה</option>
      </select>
      <select name="status" className={inputClass} defaultValue="open">
        <option value="open">פתוח</option>
        <option value="in_progress">בתהליך</option>
        <option value="done">בוצע</option>
      </select>
      <input type="date" name="due_date" className={inputClass} />
      <textarea name="notes" placeholder="הערות (אופציונלי)" rows={2} className={`${inputClass} sm:col-span-2`} />
      <div className="sm:col-span-2">
        <SubmitButton>הוספת משימה</SubmitButton>
      </div>
    </form>
  );
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <EmptyState text="אין משימות להצגה. הוסף משימה למעלה או שנה את הסינון." />;
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
              <Badge>{task.project}</Badge>
              <Badge tone={priorityTone(task.priority)}>{priorityLabel[task.priority]}</Badge>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
              {task.due_date && (
                <span>יעד: {new Date(task.due_date).toLocaleDateString("he-IL")}</span>
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
              <button className="p-1.5 text-muted hover:text-warn" title="מחיקה">
                <Trash2 size={14} />
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
