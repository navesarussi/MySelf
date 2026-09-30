import { getSupabase } from "@/lib/supabase";
import { BOOK_INCEPTION } from "./fund/nav-core";
import type { HealthReport } from "./fund/health-core";
import { missedSignals, shortfall, trackingSeries, trackingStats, type ModelLite, type SignalLite } from "./fund/tracking";
import type { FundView } from "./types-client";

export type NavDb = { day: string; equity: number; pnl: number; twr_return: number; nav_index: number; peak_index: number; drawdown: number; by_strategy: Record<string, number> | null; unattributed: number | null };

export function buildFundView(input: { nav: NavDb[]; model: ModelLite[]; signals: SignalLite[]; fills: Map<string, { entry_price: number | null; qty: number | null; asset_class: string }>; health: HealthReport | null; inception: string }): FundView {
  const all = input.nav;
  const since = all.filter((r) => r.day >= input.inception);
  const month = since.length ? since[since.length - 1].day.slice(0, 7) : "";
  const chain = (rows: NavDb[]) => (rows.length ? rows.reduce((p, r) => p * (1 + r.twr_return), 1) - 1 : null);

  // Model NAV: both groups' daily returns summed per NAV session (each is a return on the whole equity).
  const trackingCrypto = trackingSeries(all, input.model, "CRYPTO");
  const trackingStocks = trackingSeries(all, input.model, "STOCKS");
  const modelDay = new Map<string, number>();
  for (const p of [...trackingCrypto, ...trackingStocks]) modelDay.set(p.day, (modelDay.get(p.day) ?? 0) + p.model);

  let idx = 100;
  let midx = 100;
  let peak = 100;
  let maxDd = 0;
  const nav = since.map((r) => {
    idx *= 1 + r.twr_return;
    const m = modelDay.get(r.day);
    if (m !== undefined) midx *= 1 + m;
    peak = Math.max(peak, idx);
    maxDd = Math.max(maxDd, 1 - idx / peak);
    return { day: r.day, index: idx, model: modelDay.size ? midx : null };
  });

  const attr = new Map<string, { mtd_usd: number; mtd_pct: number; itd_usd: number; itd_pct: number }>();
  let unattributed = 0;
  since.forEach((r) => {
    const i = all.indexOf(r);
    const prevEq = i > 0 ? all[i - 1].equity : r.equity;
    unattributed += r.unattributed ?? 0;
    for (const [k, v] of Object.entries(r.by_strategy ?? {})) {
      const a = attr.get(k) ?? { mtd_usd: 0, mtd_pct: 0, itd_usd: 0, itd_pct: 0 };
      a.itd_usd += v;
      a.itd_pct += prevEq > 0 ? v / prevEq : 0;
      if (r.day.startsWith(month)) {
        a.mtd_usd += v;
        a.mtd_pct += prevEq > 0 ? v / prevEq : 0;
      }
      attr.set(k, a);
    }
  });
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const last = since[since.length - 1] ?? null;
  return {
    inception: input.inception,
    as_of: last?.day ?? null,
    equity: last ? Number(last.equity) : null,
    nav,
    itd_return: chain(since),
    mtd_return: chain(since.filter((r) => r.day.startsWith(month))),
    drawdown: nav.length ? 1 - idx / peak : null,
    max_drawdown: nav.length ? maxDd : null,
    attribution: [...attr.entries()].map(([strategy, a]) => ({ strategy, mtd_usd: r2(a.mtd_usd), mtd_pct: a.mtd_pct, itd_usd: r2(a.itd_usd), itd_pct: a.itd_pct })).sort((a, b) => Math.abs(b.itd_usd) - Math.abs(a.itd_usd)),
    unattributed_itd: r2(unattributed),
    tracking: [
      { grp: "CRYPTO", series: trackingCrypto, stats: trackingStats(trackingCrypto) },
      { grp: "STOCKS", series: trackingStocks, stats: trackingStats(trackingStocks) },
    ],
    shortfall: shortfall(input.signals, input.fills),
    missed: missedSignals(input.signals),
    health: input.health,
  };
}

export async function getFundView(): Promise<FundView> {
  const db = getSupabase();
  const [navRes, modelRes, sigRes, setRes] = await Promise.all([
    db.from("trading_nav_daily").select("day, equity, pnl, twr_return, nav_index, peak_index, drawdown, by_strategy, unattributed").order("day", { ascending: true }).limit(1000),
    db.from("trading_model_book").select("day, grp, day_return").order("day", { ascending: true }).limit(5000),
    db.from("trading_book_signals").select("strategy, entry, decision, trade_id").gte("bar", BOOK_INCEPTION).limit(20000),
    db.from("trading_settings").select("health").eq("id", true).maybeSingle(),
  ]);
  for (const r of [navRes, modelRes, sigRes, setRes]) if (r.error) throw new Error(`fund: ${r.error.message}`);
  const signals = (sigRes.data ?? []).map((s) => ({ strategy: String(s.strategy), entry: Number(s.entry), decision: String(s.decision), trade_id: (s.trade_id as string) ?? null }));
  const ids = [...new Set(signals.map((s) => s.trade_id).filter((x): x is string => Boolean(x)))];
  const fills = new Map<string, { entry_price: number | null; qty: number | null; asset_class: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("trading_trades").select("id, entry_price, broker_filled_qty, asset_class").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`fund fills: ${error.message}`);
    for (const t of data ?? []) fills.set(String(t.id), { entry_price: t.entry_price === null ? null : Number(t.entry_price), qty: t.broker_filled_qty === null ? null : Number(t.broker_filled_qty), asset_class: String(t.asset_class) });
  }
  const nav = (navRes.data ?? []).map((r) => ({ ...r, equity: Number(r.equity), pnl: Number(r.pnl), unattributed: r.unattributed === null ? null : Number(r.unattributed) })) as NavDb[];
  return buildFundView({ nav, model: (modelRes.data ?? []) as ModelLite[], signals, fills, health: (setRes.data?.health as HealthReport) ?? null, inception: BOOK_INCEPTION });
}
