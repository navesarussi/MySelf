import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { getTranslations } from "@/lib/i18n";
import type { Project, Relationship, Task } from "@/lib/types";
import { ProjectBoard } from "./project-board";
import { isAddTarget } from "@/lib/add-menu";

export const revalidate = 30;

type TaskRow = Task & { projects: { name: string } | null };
type RelRow = Relationship & { projects: { name: string } | null };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; tab?: string; add?: string }>;
}) {
  const { t } = await getTranslations();

  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title={t("projects.title")} />
        <DbWarning />
      </>
    );
  }

  const sp = await searchParams;
  const add = isAddTarget(sp.add) ? sp.add : undefined;
  const supabase = getSupabase();
  const [{ data: projects }, { data: tasks }, { data: relationships }] = await Promise.all([
    supabase.from("projects").select("*").order("sort_order"),
    supabase.from("tasks").select("*, projects(name)").order("created_at", { ascending: false }),
    supabase.from("relationships").select("*, projects(name)").order("name"),
  ]);

  const projectList = (projects || []) as Project[];
  const selectedId =
    sp.project && projectList.some((p) => p.id === sp.project)
      ? sp.project
      : projectList[0]?.id;
  const tab =
    add === "contact"
      ? "connections"
      : add === "task"
        ? "missions"
        : sp.tab === "connections"
          ? "connections"
          : "missions";

  const allTasks = ((tasks || []) as TaskRow[]).map((row) => ({
    ...row,
    project_name: row.projects?.name,
  }));
  const allRels = ((relationships || []) as RelRow[]).map((row) => ({
    ...row,
    project_name: row.projects?.name,
  }));

  return (
    <>
      <PageHeader title={t("projects.title")} subtitle={t("projects.subtitle")} />
      <ProjectBoard
        projects={projectList}
        selectedProjectId={selectedId}
        tab={tab}
        tasks={allTasks}
        relationships={allRels}
        addTarget={add}
      />
    </>
  );
}
