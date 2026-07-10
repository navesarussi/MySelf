import { getSupabase } from "@/lib/supabase";
import { dbConfigured } from "@/lib/db-status";
import { DbWarning } from "@/components/db-warning";
import { PageHeader, EmptyState, Badge, SubmitButton, inputClass } from "@/components/ui";
import type { ContentEntry } from "@/lib/types";
import { addContentEntry, updateContentEntry, deleteContentEntry } from "./actions";
import { Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  if (!dbConfigured()) {
    return (
      <>
        <PageHeader title="ספריית תוכן" />
        <DbWarning />
      </>
    );
  }

  const supabase = getSupabase();
  const { data } = await supabase.from("content_entries").select("*").order("updated_at", { ascending: false });
  const entries = (data as ContentEntry[]) || [];

  const q = (resolvedSearchParams.q || "").trim().toLowerCase();
  const category = resolvedSearchParams.category || "";

  const categories = Array.from(new Set(entries.map((e) => e.category))).sort();

  const filtered = entries.filter((e) => {
    const matchesCategory = !category || e.category === category;
    const matchesQuery =
      !q ||
      e.title.toLowerCase().includes(q) ||
      e.body.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q));
    return matchesCategory && matchesQuery;
  });

  return (
    <>
      <PageHeader title="ספריית תוכן" subtitle="פסיכולוגיה, פחדים, קשרים, סיפורים — כל מה שידוע עליי" />

      <form className="mb-4 flex flex-wrap gap-2" action="/library">
        <input
          type="text"
          name="q"
          defaultValue={resolvedSearchParams.q}
          placeholder="חיפוש..."
          className={`${inputClass} max-w-xs`}
        />
        <select name="category" defaultValue={category} className={`${inputClass} max-w-[200px]`}>
          <option value="">כל הקטגוריות</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="rounded-lg border px-4 py-2 text-sm hover:bg-border/30">סינון</button>
      </form>

      <details className="mb-8">
        <summary className="cursor-pointer text-sm text-muted">+ רשומה חדשה</summary>
        <form action={addContentEntry} className="card mt-3 grid gap-3 p-4">
          <input type="text" name="title" placeholder="כותרת" required className={inputClass} />
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="text" name="category" placeholder="קטגוריה (למשל: פסיכולוגיה, פחדים, קשרים, סיפורים)" className={inputClass} />
            <input type="text" name="tags" placeholder="תגיות, מופרדות בפסיקים" className={inputClass} />
          </div>
          <textarea name="body" placeholder="התוכן..." required rows={6} className={inputClass} />
          <div>
            <SubmitButton>שמירה</SubmitButton>
          </div>
        </form>
      </details>

      {filtered.length === 0 ? (
        <EmptyState text="לא נמצאו רשומות תואמות." />
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <details key={e.id} className="card p-4">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{e.title}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="accent">{e.category}</Badge>
                  {e.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
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
                  <SubmitButton>עדכון</SubmitButton>
                  <span className="text-xs text-muted">עריכה</span>
                </div>
              </form>

              <form action={deleteContentEntry} className="mt-2">
                <input type="hidden" name="id" value={e.id} />
                <button className="flex items-center gap-1 text-xs text-muted hover:text-warn">
                  <Trash2 size={13} /> מחיקת הרשומה
                </button>
              </form>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
