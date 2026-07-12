"use client";

import { useMemo, useState } from "react";
import type { Goal } from "@/lib/types";
import { ALL_FILTER } from "@/lib/i18n/types";
import { useTranslations } from "@/components/locale-provider";
import { Badge, SubmitButton, EmptyState, inputClass } from "@/components/ui";
import { AddFormToggle } from "@/components/add-form-toggle";
import { addGoal, toggleGoalStatus, deleteGoal } from "./actions";
import { Target, Trash2, RotateCcw, ChevronDown, Search } from "lucide-react";

const DEFAULT_CATEGORY = "כללי";

function groupBy<T, K extends string>(items: T[], key: (item: T) => K) {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return map;
}

export function GoalsSection({
  goals,
  defaultOpen = false,
}: {
  goals: Goal[];
  defaultOpen?: boolean;
}) {
  const { t, locale } = useTranslations();
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status === "done");
  const categories = useMemo(
    () => [...new Set(active.map((g) => g.category || DEFAULT_CATEGORY))].sort((a, b) => a.localeCompare(b, locale)),
    [active, locale]
  );

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_FILTER);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active.filter((g) => {
      if (categoryFilter !== ALL_FILTER && (g.category || DEFAULT_CATEGORY) !== categoryFilter) return false;
      if (!q) return true;
      const hay = [g.title, g.category, g.horizon, g.first_step, g.definition_of_done]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [active, query, categoryFilter]);

  const grouped = groupBy(filtered, (g) => g.category || DEFAULT_CATEGORY);

  function toggleCategory(cat: string) {
    setCollapsed((c) => ({ ...c, [cat]: !c[cat] }));
  }

  function categoryLabel(cat: string, items: Goal[]) {
    if (cat === DEFAULT_CATEGORY) {
      const anyExplicit = items.some((g) => g.category === DEFAULT_CATEGORY);
      const anyEmpty = items.some((g) => !g.category);
      if (anyEmpty && !anyExplicit) return t("common.general");
    }
    return cat;
  }

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-bold">{t("goals.sectionTitle")}</h2>

      <div className="card mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("goals.searchPlaceholder")}
            className={`${inputClass} ps-9`}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter(ALL_FILTER)}
            className={`rounded-full px-3 py-1 text-xs ${categoryFilter === ALL_FILTER ? "bg-accent text-bg" : "bg-border/50 text-muted"}`}
          >
            {t("common.all")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-full px-3 py-1 text-xs ${categoryFilter === cat ? "bg-accent text-bg" : "bg-border/50 text-muted"}`}
            >
              {categoryLabel(cat, active.filter((g) => (g.category || DEFAULT_CATEGORY) === cat))}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={active.length === 0 ? t("goals.noActive") : t("goals.noFilterResults")} />
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([category, items]) => {
            const isCollapsed = collapsed[category] ?? false;
            return (
              <div key={category} className="card overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start hover:bg-border/20"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <Target size={14} className="text-accent" />
                    {categoryLabel(category, items)}
                    <Badge>{items.length}</Badge>
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-muted transition ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>
                {!isCollapsed && (
                  <div className="space-y-2 border-t border-border px-4 py-3">
                    {items.map((g) => (
                      <div key={g.id} className="rounded-lg bg-border/15 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium">{g.title}</h4>
                          <div className="flex shrink-0 items-center gap-1">
                            <form action={toggleGoalStatus}>
                              <input type="hidden" name="id" value={g.id} />
                              <input type="hidden" name="status" value={g.status} />
                              <button
                                className="rounded-full bg-good/15 px-2.5 py-1 text-xs font-medium text-good hover:opacity-80"
                                title={t("goals.markDone")}
                              >
                                {t("goals.markDoneBtn")}
                              </button>
                            </form>
                            <form action={deleteGoal}>
                              <input type="hidden" name="id" value={g.id} />
                              <button className="p-1.5 text-muted hover:text-warn" title={t("common.delete")}>
                                <Trash2 size={14} />
                              </button>
                            </form>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                          {g.horizon && <Badge>{t("common.horizon")}: {g.horizon}</Badge>}
                        </div>
                        <div className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                          {g.first_step && (
                            <p>
                              <span className="text-muted">{t("common.firstStep")}: </span>
                              {g.first_step}
                            </p>
                          )}
                          {g.definition_of_done && (
                            <p>
                              <span className="text-muted">{t("common.definitionOfDone")}: </span>
                              {g.definition_of_done}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AddFormToggle
        label={t("goals.addNew")}
        defaultOpen={defaultOpen}
        className="mt-4"
        id="add-form-goal"
      >
        <form action={addGoal} className="card grid gap-3 p-4 sm:grid-cols-2">
          <input type="text" name="title" placeholder={t("goals.titlePlaceholder")} required className={`${inputClass} sm:col-span-2`} />
          <input type="text" name="category" placeholder={t("common.general")} className={inputClass} />
          <input type="text" name="horizon" placeholder={t("goals.horizonPlaceholder")} className={inputClass} />
          <input type="text" name="first_step" placeholder={t("goals.firstStepPlaceholder")} className={inputClass} />
          <input type="text" name="definition_of_done" placeholder={t("goals.doneDefinitionPlaceholder")} className={inputClass} />
          <div className="sm:col-span-2">
            <SubmitButton>{t("common.add")}</SubmitButton>
          </div>
        </form>
      </AddFormToggle>

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-medium text-muted">
            {t("goals.fulfilledDreams", { count: done.length })}
          </summary>
          <div className="mt-3 space-y-2">
            {done.map((g) => (
              <div key={g.id} className="card flex items-center justify-between p-3 text-sm">
                <span>{g.title}</span>
                <form action={toggleGoalStatus}>
                  <input type="hidden" name="id" value={g.id} />
                  <input type="hidden" name="status" value={g.status} />
                  <button className="flex items-center gap-1 text-muted hover:text-ink" title={t("goals.restoreActive")}>
                    <RotateCcw size={13} />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
