/**
 * Live vs model, pure. Live group return on a NAV session = the group's attributed $ P&L ÷ the previous session's
 * equity; model group return = the model's daily returns compounded over the days since the previous session
 * (crypto trades weekends; NAV sessions do not). IBS_CLOSE, MANUAL and UNTRACKED have no model and are left out.
 */
export const GROUP_OF_STRATEGY: Record<string, "CRYPTO" | "STOCKS"> = {
  CRYPTO_TREND: "CRYPTO",
  MOMENTUM: "STOCKS",
  ASSET_ROTATION: "STOCKS",
  REVERSAL: "STOCKS",
  PULLBACK: "STOCKS",
};

export type NavLite = { day: string; equity: number; by_strategy: Record<string, number> | null };
export type ModelLite = { day: string; grp: string; day_return: number };
export type TrackPoint = { day: string; live: number; model: number; diff: number };

export function trackingSeries(nav: NavLite[], model: ModelLite[], grp: "CRYPTO" | "STOCKS"): TrackPoint[] {
  const m = model.filter((x) => x.grp === grp).sort((a, b) => a.day.localeCompare(b.day));
  const out: TrackPoint[] = [];
  for (let i = 1; i < nav.length; i++) {
    const prev = nav[i - 1];
    const cur = nav[i];
    if (!cur.by_strategy || !(prev.equity > 0)) continue;
    const window = m.filter((x) => x.day > prev.day && x.day <= cur.day);
    if (!window.length) continue;
    const pnl = Object.entries(cur.by_strategy).reduce((s, [k, v]) => s + (GROUP_OF_STRATEGY[k] === grp ? v : 0), 0);
    const live = pnl / prev.equity;
    const modelRet = window.reduce((p, x) => p * (1 + x.day_return), 1) - 1;
    out.push({ day: cur.day, live, model: modelRet, diff: live - modelRet });
  }
  return out;
}

export function trackingStats(series: TrackPoint[], window = 20): { days: number; live_cum: number; model_cum: number; diff_cum: number; te_annual: number | null } {
  const s = series.slice(-window);
  const cum = (k: "live" | "model") => s.reduce((p, x) => p * (1 + x[k]), 1) - 1;
  const d = s.map((x) => x.diff);
  const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
  const sd = d.length > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length) : null;
  const live_cum = cum("live");
  const model_cum = cum("model");
  return { days: s.length, live_cum, model_cum, diff_cum: live_cum - model_cum, te_annual: sd === null ? null : sd * Math.sqrt(252) };
}

export type SignalLite = { strategy: string; entry: number; decision: string; trade_id: string | null };

/**
 * Fill vs the signal's reference price, per strategy. Stocks signal at the close and fill at the next open, so
 * this includes the overnight gap — noise per trade, near zero on average; the research assumes the same timing.
 */
export function shortfall(signals: SignalLite[], fills: Map<string, { entry_price: number | null; qty: number | null; asset_class: string }>): { strategy: string; n: number; mean_bps: number; usd: number }[] {
  const by = new Map<string, { n: number; bps: number; usd: number }>();
  for (const s of signals) {
    if (s.decision !== "ENTERED" || !s.trade_id || !(s.entry > 0)) continue;
    const f = fills.get(s.trade_id);
    if (!f || f.entry_price === null || !(f.entry_price > 0)) continue;
    const g = by.get(s.strategy) ?? { n: 0, bps: 0, usd: 0 };
    g.n += 1;
    g.bps += ((f.entry_price - s.entry) / s.entry) * 10_000;
    g.usd += (f.entry_price - s.entry) * (f.qty ?? 0);
    by.set(s.strategy, g);
  }
  return [...by.entries()].map(([strategy, g]) => ({ strategy, n: g.n, mean_bps: g.bps / g.n, usd: g.usd })).sort((a, b) => b.n - a.n);
}

export function missedSignals(signals: SignalLite[]): { reason: string; n: number }[] {
  const by = new Map<string, number>();
  for (const s of signals) if (s.decision !== "ENTERED") by.set(s.decision, (by.get(s.decision) ?? 0) + 1);
  return [...by.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
}
