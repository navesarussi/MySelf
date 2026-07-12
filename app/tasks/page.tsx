import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { ALL_FILTER, getTranslations } from "@/lib/i18n";
import type { Project, Task, TaskStatus } from "@/lib/types";
import { TasksPanel } from "./task-board";
import { isAddTarget } from "@/lib/add-menu";

export const revalidate = 30;

const statuses: Array<TaskStatus | typeof ALL_FILTER> = [ALL_FILTER, "open", "in_progress", "done"];

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
  if (projectId && projectId !== ALL_FILTER) q = q.eq("project_id", projectId);
  if (status && status !== ALL_FILTER) q = q.eq("status", status);
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
  searchParams: Promise<{ project?: string; status?: string; add?: string }>;
}) {
  const { t } = await getTranslations();

  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitle")} />
        <DbWarning />
      </>
    );
  }

  const sp = await searchParams;
  const add = isAddTarget(sp.add) ? sp.add : undefined;
  const projectId = sp.project || ALL_FILTER;
  const status = sp.status || ALL_FILTER;
  const [projects, tasks] = await Promise.all([getProjects(), getTasks(projectId, status)]);
  const defaultProjectId =
    projects.find((p) => p.name === "אישי")?.id ?? projects[0]?.id;

  const statusLabel = (s: TaskStatus | typeof ALL_FILTER) => {
    if (s === ALL_FILTER) return t("common.all");
    if (s === "open") return t("common.open");
    if (s === "in_progress") return t("common.inProgress");
    return t("common.done");
  };

  return (
    <>
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitleAlt")} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/tasks?project=${encodeURIComponent(ALL_FILTER)}&status=${encodeURIComponent(status)}`}
          className={`rounded-full px-3 py-1 text-xs ${
            projectId === ALL_FILTER ? "bg-accent text-bg" : "bg-border/50 text-muted hover:text-ink"
          }`}
        >
          {t("common.all")}
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
            {statusLabel(s)}
          </Link>
        ))}
      </div>

      <TasksPanel
        tasks={tasks}
        projects={projects}
        defaultProjectId={defaultProjectId}
        defaultOpen={add === "task"}
      />
    </>
  );
}
