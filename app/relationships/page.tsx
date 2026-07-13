import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader } from "@/components/ui";
import { getTranslations } from "@/lib/i18n";
import type { Project, Relationship } from "@/lib/types";
import { RelationshipsPanel } from "./relationship-board";
import { isAddTarget } from "@/lib/add-menu";
import { getLastProject } from "@/lib/last-project";

export const revalidate = 30;

type RelRow = Relationship & { projects: { name: string } | null };

export default async function RelationshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const { t } = await getTranslations();
  const sp = await searchParams;
  const add = isAddTarget(sp.add) ? sp.add : undefined;

  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title={t("relationships.title")} />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();
  const [{ data: projects }, { data }, lastProject] = await Promise.all([
    supabase.from("projects").select("*").order("sort_order"),
    supabase.from("relationships").select("*, projects(name)").order("name"),
    getLastProject("contact"),
  ]);

  const projectList = (projects || []) as Project[];
  const relationships = ((data || []) as RelRow[]).map((row) => ({
    ...row,
    project_name: row.projects?.name,
    projects: undefined,
  }));
  const fallbackProjectId =
    projectList.find((p) => p.name === "כללי")?.id ?? projectList[0]?.id;
  const defaultProjectId =
    (lastProject && projectList.some((p) => p.id === lastProject) ? lastProject : undefined) ??
    fallbackProjectId;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title={t("relationships.title")} subtitle={t("relationships.subtitle")} />
      <RelationshipsPanel
        relationships={relationships}
        projects={projectList}
        defaultProjectId={defaultProjectId}
        defaultOpen={add === "contact"}
        today={today}
      />
    </>
  );
}
