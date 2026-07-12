import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, EmptyState } from "@/components/ui";
import type { Project, Relationship } from "@/lib/types";
import { RelationshipForm, RelationshipCard } from "./relationship-board";

export const revalidate = 30;

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

export default async function RelationshipsPage() {
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="ניהול קשרים" />
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
  const grouped = groupBy(relationships, (r) => r.group_name || "אחר");
  const defaultProjectId =
    projectList.find((p) => p.name === "כללי")?.id ?? projectList[0]?.id;
  const today = new Date();

  return (
    <>
      <PageHeader title="ניהול קשרים" subtitle="משפחה, חברים ובת/בן זוג — מי מחכה לשמוע ממך" />

      <RelationshipForm projects={projectList} defaultProjectId={defaultProjectId} />

      {relationships.length === 0 ? (
        <EmptyState text="אין עדיין אנשי קשר. הוסף את הראשון למעלה." />
      ) : (
        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([group, people]) => (
            <div key={group}>
              <h2 className="mb-3 text-sm font-semibold text-muted">{group}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {people.map((r) => (
                  <RelationshipCard key={r.id} r={r} today={today} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
