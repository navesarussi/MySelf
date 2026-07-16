import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, FilterBar, FilterChips, type ChipOption } from "@/components/ui";
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

async function getTasks(projectId?: string, statuses?: TaskStatus[], priority?: string): Promise<Task[]> {
  const supabase = getSupabase();
  let q = supabase
    .from("tasks")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });
  if (projectId && projectId !== ALL_FILTER) q = q.eq("project_id", projectId);
  if (statuses && statuses.length > 0) q = q.in("status", statuses);
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
  const isTaskStatus = (s: string): s is TaskStatus => s === "open" || s === "in_progress" || s === "done";
  const selectedStatuses: TaskStatus[] =
    sp.status && sp.status !== ALL_FILTER ? sp.status.split(",").filter(isTaskStatus) : [];
  const priority = sp.priority || ALL_FILTER;
  const [projects, tasks, lastProject] = await Promise.all([
    getProjects(),
    getTasks(projectId, selectedStatuses, priority),
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
    p.set("status", patch.status ?? (selectedStatuses.length ? selectedStatuses.join(",") : ALL_FILTER));
    p.set("priority", patch.priority ?? priority);
    return `/legacy/tasks?${p.toString()}`;
  };

  const statusHref = (s: TaskStatus | typeof ALL_FILTER) => {
    if (s === ALL_FILTER) return withParams({ status: ALL_FILTER });
    const next = selectedStatuses.includes(s)
      ? selectedStatuses.filter((x) => x !== s)
      : [...selectedStatuses, s];
    return withParams({ status: next.length ? next.join(",") : ALL_FILTER });
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

  const projectOptions: ChipOption[] = [
    { value: ALL_FILTER, label: t("common.all") },
    ...projects.map((p) => ({ value: p.id, label: p.name })),
  ];
  const statusOptions: ChipOption[] = statuses.map((s) => ({ value: s, label: statusLabel(s) }));
  const priorityOptions: ChipOption[] = priorities.map((p) => ({ value: p, label: priorityLabel(p) }));

  return (
    <>
      <PageHeader title={t("tasks.title")} subtitle={t("tasks.subtitleAlt")} />

      <FilterBar>
        <div className="w-full">
          <FilterChips
            label={t("nav.projects")}
            options={projectOptions}
            value={projectId}
            hrefFor={(v) => withParams({ project: v })}
          />
        </div>
        <div className="w-full">
          <FilterChips
            label={t("common.status")}
            options={statusOptions}
            value={selectedStatuses.length ? selectedStatuses.join(",") : ALL_FILTER}
            hrefFor={(v) => statusHref(v as TaskStatus | typeof ALL_FILTER)}
            isActive={(v) =>
              v === ALL_FILTER ? selectedStatuses.length === 0 : selectedStatuses.includes(v as TaskStatus)
            }
          />
        </div>
        <div className="w-full">
          <FilterChips
            label={t("tasks.priorityFilter")}
            options={priorityOptions}
            value={priority}
            hrefFor={(v) => withParams({ priority: v })}
          />
        </div>
      </FilterBar>

      <TasksPanel
        tasks={tasks}
        projects={projects}
        defaultProjectId={defaultProjectId}
        defaultOpen={add === "task"}
      />
    </>
  );
}
