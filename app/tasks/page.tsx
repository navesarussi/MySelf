import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { ALL_FILTER, getTranslations } from "@/lib/i18n";
import type { Project, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { TasksPanel } from "./task-board";
import { isAddTarget } from "@/lib/add-menu";
import { getLastProject } from "@/lib/last-project";

export const revalidate = 30;

const statuses: Array<TaskStatus | typeof ALL_FILTER> = [ALL_FILTER, "open", "in_progress", "done"];
const priorities: Array<TaskPriority | typeof ALL_FILTER> = [ALL_FILTER, "high", "medium", "low"];

type TaskRow = Task & { projects: { name: string } | null };

async function getProjects(): Promise<Project[]> {
  const supabase = getSupabase();
  const { data } = await supabase.from("projects").select("*").order("sort_order");
  return (data || []) as Project[];
}

async function getTasks(projectId?: string, status?: string, priority?: string): Promise<Task[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("tasks")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });
  if (projectId && projectId !== ALL_FILTER) q = q.eq("project_id", projectId);
  if (status && status !== ALL_FILTER) q = q.eq("status", status);
  if (priority && priority !== ALL_FILTER) q = q.eq("priority", priority);
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
  searchParams: Promise<{ project?: string; status?: string; priority?: string; add?: string }>;
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
  const priority = sp.priority || ALL_FILTER;
  const [projects, tasks, lastProject] = await Promise.all([
    getProjects(),
    getTasks(projectId, status, priority),
    getLastProject("task"),
  ]);
  const fallbackProjectId =
    projects.find((p) => p.name === "אישי")?.id ?? projects[0]?.id;
  const defaultProjectId =
    (lastProject && projects.some((p) => p.id === lastProject) ? lastProject : undefined) ??
    fallbackProjectId;

  const withParams = (patch: { project?: string; status?: string; priority?: string }) => {
    const p = new URLSearchParams();
    p.set("project", patch.project ?? projectId);
    p.set("status", patch.status ?? status);
    p.set("priority", patch.priority ?? priority);
    return `/tasks?${p.toString()}`;
  };

  const statusLabel = (s: TaskStatus | typeof ALL_FILTER) => {
    if (s === ALL_FILTER) return t("common.all");
    if (s === "open") return t("common.open");
    if (s === "in_progress") return t("common.inProgress");
    return t("common.done");
  };

  const priorityLabel = (p: TaskPriority | typeof ALL_FILTER) => {
    if (p === ALL_FILTER) return t("common.all");
    if (p === "high") return t("common.high");
    if (p === "medium") return t("common.medium");
    return t("common.low");
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs ${
      active ? "bg-accent text-bg" : "bg-border/50 text-muted hover:text-ink"
    }`;

  return (
    <>
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitleAlt")} />

      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={withParams({ project: ALL_FILTER })} className={chip(projectId === ALL_FILTER)}>
          {t("common.all")}
        </Link>
        {projects.map((p) => (
          <Link key={p.id} href={withParams({ project: p.id })} className={chip(projectId === p.id)}>
            {p.name}
          </Link>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <Link key={s} href={withParams({ status: s })} className={chip(status === s)}>
            {statusLabel(s)}
          </Link>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t("tasks.priorityFilter")}:</span>
        {priorities.map((p) => (
          <Link key={p} href={withParams({ priority: p })} className={chip(priority === p)}>
            {priorityLabel(p)}
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
