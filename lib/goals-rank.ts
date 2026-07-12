import type { Goal } from "@/lib/types";

/** Lower = sooner / closer target. Null = unknown horizon sorts last. */
export function parseHorizonSortKey(horizon: string | null): number | null {
  if (!horizon?.trim()) return null;
  const t = horizon.trim();

  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`).getTime();

  const yearMonth = t.match(/^(\d{4})-(\d{2})$/);
  if (yearMonth) return new Date(`${yearMonth[1]}-${yearMonth[2]}-01`).getTime();

  const year = t.match(/\b(20\d{2})\b/);
  if (year) {
    const q = t.match(/Q([1-4])|רבעון\s*([1-4])|q([1-4])/i);
    if (q) {
      const qi = Number(q[1] || q[2] || q[3]);
      return new Date(Number(year[1]), (qi - 1) * 3, 1).getTime();
    }
    const months: Record<string, number> = {
      ינואר: 0, פברואר: 1, מרץ: 2, אפריל: 3, מאי: 4, יוני: 5,
      יולי: 6, אוגוסט: 7, ספטמבר: 8, אוקטובר: 9, נובמבר: 10, דצמבר: 11,
    };
    for (const [name, m] of Object.entries(months)) {
      if (t.includes(name)) return new Date(Number(year[1]), m, 1).getTime();
    }
    return new Date(Number(year[1]), 6, 1).getTime();
  }
  return null;
}

/** Higher = more actionable / achievable right now. */
export function achievabilityScore(goal: Goal): number {
  let s = 0;
  if (goal.first_step?.trim()) s += 3;
  if (goal.definition_of_done?.trim()) s += 2;
  if (goal.horizon?.trim()) s += 1;
  return s;
}

export function rankGoalsForHome(goals: Goal[], limit = 5): Goal[] {
  const active = goals.filter((g) => g.status === "active");

  return [...active]
    .sort((a, b) => {
      const ha = parseHorizonSortKey(a.horizon);
      const hb = parseHorizonSortKey(b.horizon);
      if (ha != null && hb != null && ha !== hb) return ha - hb;
      if (ha != null && hb == null) return -1;
      if (ha == null && hb != null) return 1;
      const aa = achievabilityScore(a);
      const ab = achievabilityScore(b);
      if (aa !== ab) return ab - aa;
      return a.title.localeCompare(b.title, "he");
    })
    .slice(0, limit);
}

export function horizonLabel(goal: Goal): string | null {
  if (!goal.horizon?.trim()) return null;
  const k = parseHorizonSortKey(goal.horizon);
  if (k == null) return goal.horizon;
  const days = Math.round((k - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return `${goal.horizon} · עבר`;
  if (days === 0) return `${goal.horizon} · היום`;
  if (days < 30) return `${goal.horizon} · עוד ${days} ימים`;
  if (days < 365) return `${goal.horizon} · עוד ${Math.round(days / 30)} חודשים`;
  return `${goal.horizon} · עוד ${Math.round(days / 365)} שנים`;
}
