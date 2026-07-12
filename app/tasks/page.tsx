import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import type { Project, Task, TaskStatus } from "@/lib/types";
import { TaskForm, TaskList } from "./task-board";

export const revalidate = 30;

const statuses: Array<TaskStatus | "הכל"> = ["הכל", "open", "in_progress", "done"];

type TaskRow = Task & { projects: { name: string } | null };

async function getProjects(): Promise<Project[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("projects").select("*").order("sort_order");
  return (data || []) as Project[];
}

async function getTasks(projectId?: string, status?: string): Promise<Task[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("tasks")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });
  if (projectId && projectId !== "הכל") q = q.eq("project_id", projectId);
  if (status && status !== "הכל") q = q.eq("status", status);
  const { data } = await q;
  return ((data || []) as TaskRow[]).map((row) => ({
    ...row,
    project_name: row.projects?.name,
    projects: undefined,
  }));
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
  const projectId = sp.project || "הכל";
  const status = sp.status || "הכל";
  const [projects, tasks] = await Promise.all([getProjects(), getTasks(projectId, status)]);
  const defaultProjectId =
    projects.find((p) => p.name === "אישי")?.id ?? projects[0]?.id;

  return (
    <>
      <PageHeader title="משימות" subtitle="נפרד מהרגלים — עדיפות, פרויקט וסטטוס" />
      <TaskForm projects={projects} defaultProjectId={defaultProjectId} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/tasks?project=${encodeURIComponent("הכל")}&status=${encodeURIComponent(status)}`}
          className={`rounded-full px-3 py-1 text-xs ${
            projectId === "הכל" ? "bg-accent text-bg" : "bg-border/50 text-muted hover:text-ink"
          }`}
        >
          הכל
        </Link>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/tasks?project=${encodeURIComponent(p.id)}&status=${encodeURIComponent(status)}`}
            className={`rounded-full px-3 py-1 text-xs ${
              projectId === p.id ? "bg-accent text-bg" : "bg-border/50 text-muted hover:text-ink"
            }`}
          >
            {p.name}
          </Link>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link
            key={s}
            href={`/tasks?project=${encodeURIComponent(projectId)}&status=${encodeURIComponent(s)}`}
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
