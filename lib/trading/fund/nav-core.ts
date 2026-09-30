import { strategyKey } from "../strategy-options";

/** First live day of the multi-strategy book — NAV before it is the intraday era (kept, labelled pre_book). */
export const BOOK_INCEPTION = "2026-09-28";

/**
 * Money moving in or out of the account. Everything else in Alpaca's cashflow map (CFEE crypto fees, FEE,
 * dividends, interest) is performance and stays in P&L.
 */
export const EXTERNAL_FLOW_TYPES = ["CSD", "CSW", "JNLC", "JNLS", "ACATC", "ACATS"] as const;

export type PortfolioHistory = { timestamp: number[]; equity: (number | null)[]; cashflow?: Record<string, number[]> };
export type NavPoint = { day: string; equity: number; cash_flow: number };

/** Alpaca daily history → one point per session with equity, net external flow on that session. */
export function historyPoints(h: PortfolioHistory): NavPoint[] {
  const out: NavPoint[] = [];
  h.timestamp.forEach((ts, i) => {
    const equity = Number(h.equity[i]);
    if (!Number.isFinite(equity) || equity <= 0) return;
    const flow = EXTERNAL_FLOW_TYPES.reduce((s, k) => s + (Number(h.cashflow?.[k]?.[i]) || 0), 0);
    out.push({ day: new Date(ts * 1000).toISOString().slice(0, 10), equity, cash_flow: flow });
  });
  return out;
}

export type NavRow = {
  day: string;
  equity: number;
  cash_flow: number;
  pnl: number;
  twr_return: number;
  nav_index: number;
  peak_index: number;
  drawdown: number;
  pre_book: boolean;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Time-weighted chain. A flow is assumed to arrive at the start of its session: that session's return is
 * pnl ÷ (previous equity + flow), so a deposit neither creates nor dilutes performance.
 */
export function chainNav(points: NavPoint[], inception: string): NavRow[] {
  const out: NavRow[] = [];
  let index = 100;
  let peak = 100;
  points.forEach((p, i) => {
    const prev = i > 0 ? points[i - 1] : null;
    const pnl = prev ? p.equity - prev.equity - p.cash_flow : 0;
    const base = prev ? prev.equity + Math.max(0, p.cash_flow) : 0;
    const twr = prev && base > 0 ? pnl / base : 0;
    index *= 1 + twr;
    peak = Math.max(peak, index);
    out.push({ day: p.day, equity: r2(p.equity), cash_flow: r2(p.cash_flow), pnl: r2(pnl), twr_return: twr, nav_index: index, peak_index: peak, drawdown: peak > 0 ? 1 - index / peak : 0, pre_book: p.day < inception });
  });
  return out;
}

/** Value of a trade's P&L at a moment: unrealized while open (broker), realized once closed (fills). */
export type Mark = { strategy: string; mark: number };
export type Marks = Record<string, Mark>;

type TradeKey = { id: string; setup: string | null; strategy_version: string | null };

export function buildMarks(input: {
  positions: { symbol: string; unrealized_pl: number; dust: boolean }[];
  open: (TradeKey & { symbol: string })[];
  closed: (TradeKey & { realized_pnl: number | null })[];
  prev: Marks | null;
}): Marks {
  const marks: Marks = {};
  for (const p of input.positions) {
    if (p.dust || !Number.isFinite(p.unrealized_pl)) continue;
    const t = input.open.find((x) => x.symbol === p.symbol);
    if (t) marks[t.id] = { strategy: strategyKey(t), mark: r2(p.unrealized_pl) };
    else marks[`pos:${p.symbol}`] = { strategy: "UNTRACKED", mark: r2(p.unrealized_pl) };
  }
  for (const c of input.closed) {
    // Not settled from fills yet: carry the last mark (no P&L invented); settlement shows up as a later delta.
    const mark = c.realized_pnl ?? input.prev?.[c.id]?.mark;
    if (mark === undefined || mark === null || !Number.isFinite(mark)) continue;
    marks[c.id] = { strategy: strategyKey(c), mark: r2(mark) };
  }
  return marks;
}

/**
 * P&L of each strategy on a day = Σ (mark now − mark at the previous day's close) over the trades marked now.
 * A trade that left the set (closed before the day) contributes nothing. Whatever the marks do not explain
 * (fees in kind, dust, interest, timing between the tick and Alpaca's session close) is `unattributed`, so
 * Σ by_strategy + unattributed = pnl exactly.
 */
export function attributeDay(prev: Marks | null, now: Marks, pnl: number): { by_strategy: Record<string, number>; unattributed: number } | null {
  if (!prev) return null;
  const by: Record<string, number> = {};
  for (const [id, m] of Object.entries(now)) {
    const d = m.mark - (prev[id]?.mark ?? 0);
    by[m.strategy] = r2((by[m.strategy] ?? 0) + d);
  }
  const explained = Object.values(by).reduce((s, x) => s + x, 0);
  return { by_strategy: by, unattributed: r2(pnl - explained) };
}
