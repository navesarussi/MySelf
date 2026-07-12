import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, EmptyState, Badge, SubmitButton, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { getTranslations } from "@/lib/i18n";
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

  return (
    <>
      <PageHeader title={t("library.title")} subtitle={t("library.subtitle")} />

      <form className="mb-4 flex flex-wrap gap-2" action="/library">
        <input
          type="text"
          name="q"
          defaultValue={resolvedSearchParams.q}
          placeholder={t("library.searchPlaceholder")}
          className={`${inputClass} max-w-xs`}
        />
        <select name="category" defaultValue={category} className={`${inputClass} max-w-[200px]`}>
          <option value="">{t("library.allCategories")}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="rounded-lg border px-4 py-2 text-sm hover:bg-border/30">{t("common.filter")}</button>
      </form>

      <AddFormToggle
        label={t("library.addEntry")}
        defaultOpen={add === "entry"}
        className="mb-8"
        id="add-form-entry"
      >
        <form action={addContentEntry} className="card grid gap-3 p-4">
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
            <details key={e.id} className="card p-4">
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

              <form action={updateContentEntry} className="card mt-4 grid gap-3 border-dashed p-3">
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
