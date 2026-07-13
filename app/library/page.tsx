import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, EmptyState, Badge, SubmitButton, inputClass, FilterBar, FilterChips, SearchInput, type ChipOption } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { ALL_FILTER, getTranslations } from "@/lib/i18n";
import { isAddTarget } from "@/lib/add-menu";
import type { ContentEntry } from "@/lib/types";
import { addContentEntry, updateContentEntry, deleteContentEntry } from "./actions";
import { Trash2 } from "lucide-react";

export const revalidate = 30;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; add?: string }>;
}) {
  const { t } = await getTranslations();
  const resolvedSearchParams = await searchParams;
  const add = isAddTarget(resolvedSearchParams.add) ? resolvedSearchParams.add : undefined;

  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title={t("library.title")} />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();
  const q = (resolvedSearchParams.q || "").trim();
  const category = resolvedSearchParams.category || "";

  let query = supabase
    .from("content_entries")
    .select("id, title, category, body, tags, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (category) query = query.eq("category", category);
  if (q) {
    const pattern = `%${q}%`;
    query = query.or(`title.ilike.${pattern},body.ilike.${pattern}`);
  }

  const { data } = await query;
  const filtered = (data as ContentEntry[]) || [];

  const { data: categoryRows } = await supabase.from("content_entries").select("category");
  const categories = Array.from(new Set((categoryRows || []).map((e) => e.category))).sort();

  const categoryOptions: ChipOption[] = [
    { value: ALL_FILTER, label: t("library.allCategories") },
    ...categories.map((c) => ({ value: c, label: c })),
  ];
  const categoryHref = (value: string) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (value !== ALL_FILTER) params.set("category", value);
    const qs = params.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  return (
    <>
      <PageHeader title={t("library.title")} subtitle={t("library.subtitle")} />

      <FilterBar>
        <form action="/library" className="flex-1">
          {category && <input type="hidden" name="category" value={category} />}
          <SearchInput name="q" defaultValue={resolvedSearchParams.q} placeholder={t("library.searchPlaceholder")} />
        </form>
        <div className="w-full">
          <FilterChips
            options={categoryOptions}
            value={category || ALL_FILTER}
            hrefFor={categoryHref}
          />
        </div>
      </FilterBar>

      <AddFormToggle
        label={t("library.addEntry")}
        defaultOpen={add === "entry"}
        className="mb-8"
        id="add-form-entry"
      >
        <form action={addContentEntry} className="card grid gap-2 p-3">
          <input type="text" name="title" placeholder={t("library.entryTitle")} required className={inputClass} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="text" name="category" placeholder={t("library.categoryPlaceholder")} className={inputClass} />
            <input type="text" name="tags" placeholder={t("library.tagsPlaceholder")} className={inputClass} />
          </div>
          <textarea name="body" placeholder={t("library.bodyPlaceholder")} required rows={6} className={inputClass} />
          <div>
            <SubmitButton>{t("common.save")}</SubmitButton>
          </div>
        </form>
      </AddFormToggle>

      {filtered.length === 0 ? (
        <EmptyState text={t("library.noResults")} />
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <details key={e.id} className="card p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{e.title}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{e.category}</Badge>
                  {e.tags.map((tag) => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              </summary>

              <div className="mt-3 whitespace-pre-wrap text-sm text-muted">{e.body}</div>

              <form action={updateContentEntry} className="card mt-3 grid gap-2 border-dashed p-2.5">
                <input type="hidden" name="id" value={e.id} />
                <input type="text" name="title" defaultValue={e.title} className={inputClass} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="text" name="category" defaultValue={e.category} className={inputClass} />
                  <input type="text" name="tags" defaultValue={e.tags.join(", ")} className={inputClass} />
                </div>
                <textarea name="body" defaultValue={e.body} rows={6} className={inputClass} />
                <div className="flex items-center gap-2">
                  <SubmitButton>{t("common.update")}</SubmitButton>
                  <span className="text-xs text-muted">{t("common.edit")}</span>
                </div>
              </form>

              <form action={deleteContentEntry} className="mt-2">
                <input type="hidden" name="id" value={e.id} />
                <button className="flex items-center gap-1 text-xs text-muted hover:text-warn">
                  <Trash2 size={13} /> {t("library.deleteEntry")}
                </button>
              </form>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
