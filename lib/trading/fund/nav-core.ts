import { strategyKey } from "../strategy-options";

/** First live day of the multi-strategy book — NAV before it is the intraday era (kept, labelled pre_book). */
export const BOOK_INCEPTION = "2026-09-28";

/**
 * Money moving in or out of the account. Everything else in Alpaca's cashflow map (CFEE crypto fees, FEE,
 * dividends, interest) is performance and stays in P&L.
 */
export const EXTERNAL_FLOW_TYPES = ["CSD", "CSW", "JNLC", "JNLS", "ACATC", "ACATS"] as const;

export type PortfolioHistory = { timestamp: number[]; equity: (number | null)[]; profit_loss: (number | null)[]; cashflow?: Record<string, number[]> };
export type NavPoint = { day: string; equity: number; pnl: number; cash_flow: number };

/**
 * Session date of an Alpaca daily point. Timestamps mark the session's end at 20:00 New York time (00:00 or
 * 01:00 UTC the next day; 22:00 UTC on early-close days), so six hours back always lands on the session date.
 */
export function sessionDay(tsSeconds: number): string {
  return new Date(tsSeconds * 1000 - 6 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Alpaca daily history → one point per closed session. P&L is Alpaca's own `profit_loss` (equity change net of
 * deposits and withdrawals — measured equal to Δequity − flows to the cent); flows are kept for display. Days
 * before funding show a placeholder equity with zero P&L and chain as 0% returns.
 */
export function historyPoints(h: PortfolioHistory): NavPoint[] {
  const out: NavPoint[] = [];
  h.timestamp.forEach((ts, i) => {
    const equity = Number(h.equity[i]);
    if (!Number.isFinite(equity) || equity <= 0) return;
    const pnl = Number(h.profit_loss[i]) || 0;
    const flow = EXTERNAL_FLOW_TYPES.reduce((s, k) => s + (Number(h.cashflow?.[k]?.[i]) || 0), 0);
    out.push({ day: sessionDay(ts), equity, pnl, cash_flow: flow });
  });
  return out;
}

/**
 * The session in progress, from the live account: equity now vs the last close (Alpaca's `last_equity`).
 * Intraday deposits are not visible here; the row is corrected when the session closes into the history.
 */
export function liveSessionPoint(input: { day: string; equity: number; last_equity: number }): NavPoint | null {
  if (!(input.equity > 0) || !(input.last_equity > 0)) return null;
  return { day: input.day, equity: input.equity, pnl: input.equity - input.last_equity, cash_flow: 0 };
}

/** The session a moment belongs to (New York date; weekends roll to Monday — Alpaca folds them into it). */
export function currentSessionDay(now: number): string {
  const ny = new Date(now - (isNyDst(now) ? 4 : 5) * 3_600_000);
  const dow = ny.getUTCDay();
  const add = dow === 6 ? 2 : dow === 0 ? 1 : 0;
  return new Date(ny.getTime() + add * 86_400_000).toISOString().slice(0, 10);
}

/** US DST: second Sunday of March 07:00 UTC → first Sunday of November 06:00 UTC. */
function isNyDst(t: number): boolean {
  const y = new Date(t).getUTCFullYear();
  const nthSunday = (month: number, n: number) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const start = Date.UTC(y, 2, nthSunday(2, 2), 7);
  const end = Date.UTC(y, 10, nthSunday(10, 1), 6);
  return t >= start && t < end;
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

/** Time-weighted chain: each session's return is its P&L over the capital it started with (equity − P&L). */
export function chainNav(points: NavPoint[], inception: string): NavRow[] {
  const out: NavRow[] = [];
  let index = 100;
  let peak = 100;
  for (const p of points) {
    const base = p.equity - p.pnl;
    const twr = base > 0 ? p.pnl / base : 0;
    index *= 1 + twr;
    peak = Math.max(peak, index);
    out.push({ day: p.day, equity: r2(p.equity), cash_flow: r2(p.cash_flow), pnl: r2(p.pnl), twr_return: twr, nav_index: index, peak_index: peak, drawdown: peak > 0 ? 1 - index / peak : 0, pre_book: p.day < inception });
  }
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
