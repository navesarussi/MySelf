import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import type { Task, TaskProject, TaskStatus } from "@/lib/types";
import { TaskForm, TaskList } from "./task-board";

export const revalidate = 30;

const projects: Array<TaskProject | "הכל"> = ["הכל", "Digital Scale", "Glowy", "KupaPay", "אישי", "אחר"];
const statuses: Array<TaskStatus | "הכל"> = ["הכל", "open", "in_progress", "done"];

async function getTasks(project?: string, status?: string): Promise<Task[]> {
  const supabase = getSupabase();
  let q = supabase.from("tasks").select("*").order("created_at", { ascending: false });
  if (project && project !== "הכל") q = q.eq("project", project);
  if (status && status !== "הכל") q = q.eq("status", status);
  const { data } = await q;
  return (data || []) as Task[];
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; status?: string }>;
}) {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="משימות" subtitle="משימות לפי פרויקט ועדיפות" />
        <DbWarning />
      </>
    );
  }

  const sp = await searchParams;
  const project = sp.project || "הכל";
  const status = sp.status || "הכל";
  const tasks = await getTasks(project, status);

  return (
    <>
      <PageHeader title="משימות" subtitle="נפרד מהרגלים — עדיפות, פרויקט וסטטוס" />
      <TaskForm />

      <div className="mb-4 flex flex-wrap gap-2">
        {projects.map((p) => (
          <Link
            key={p}
            href={`/tasks?project=${encodeURIComponent(p)}&status=${encodeURIComponent(status)}`}
            className={`rounded-full px-3 py-1 text-xs ${
              project === p ? "bg-accent text-bg" : "bg-border/50 text-muted hover:text-ink"
            }`}
          >
            {p}
          </Link>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/tasks?project=${encodeURIComponent(project)}&status=${encodeURIComponent(s)}`}
            className={`rounded-full px-3 py-1 text-xs ${
              status === s ? "bg-accent text-bg" : "bg-border/50 text-muted hover:text-ink"
            }`}
          >
            {s === "הכל" ? "הכל" : s === "open" ? "פתוח" : s === "in_progress" ? "בתהליך" : "בוצע"}
          </Link>
        ))}
      </div>

      <TaskList tasks={tasks} />
    </>
  );
}
