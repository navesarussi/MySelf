import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, EmptyState } from "@/components/ui";
import { getTranslations } from "@/lib/i18n";
import type { Project, Relationship } from "@/lib/types";
import { RelationshipForm, RelationshipCard } from "./relationship-board";
import { isAddTarget } from "@/lib/add-menu";

export const revalidate = 30;

const DEFAULT_GROUP = "אחר";

type RelRow = Relationship & { projects: { name: string } | null };

function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

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
  const [{ data: projects }, { data }] = await Promise.all([
    supabase.from("projects").select("*").order("sort_order"),
    supabase.from("relationships").select("*, projects(name)").order("name"),
  ]);

  const projectList = (projects || []) as Project[];
  const relationships = ((data || []) as RelRow[]).map((row) => ({
    ...row,
    project_name: row.projects?.name,
    projects: undefined,
  }));
  const grouped = groupBy(relationships, (r) => r.group_name || DEFAULT_GROUP);
  const defaultProjectId =
    projectList.find((p) => p.name === "כללי")?.id ?? projectList[0]?.id;
  const today = new Date();

  function groupLabel(group: string, people: Relationship[]) {
    if (group === DEFAULT_GROUP) {
      const anyExplicit = people.some((r) => r.group_name === DEFAULT_GROUP);
      const anyEmpty = people.some((r) => !r.group_name);
      if (anyEmpty && !anyExplicit) return t("common.other");
    }
    return group;
  }

  return (
    <>
      <PageHeader title={t("relationships.title")} subtitle={t("relationships.subtitle")} />

      <RelationshipForm
        projects={projectList}
        defaultProjectId={defaultProjectId}
        defaultOpen={add === "contact"}
      />

      {relationships.length === 0 ? (
        <EmptyState text={t("relationships.empty")} />
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([group, people]) => (
            <div key={group}>
              <h2 className="mb-3 text-sm font-semibold text-muted">{groupLabel(group, people)}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {people.map((r) => (
                  <RelationshipCard key={r.id} r={r} projects={projectList} today={today} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
