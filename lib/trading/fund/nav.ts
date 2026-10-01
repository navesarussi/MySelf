import { getSupabase } from "@/lib/supabase";
import { alpaca, fromAlpacaPositionSymbol, isDustPosition } from "../broker/alpaca";
import { marketCalendar } from "../broker/alpaca-data";
import { getOpenTrades } from "../store";
import { attributeDay, BOOK_INCEPTION, buildMarks, chainNav, historyPoints, liveSessionPoint, planNavPoints, sessionAfter, type Marks, type NavPoint } from "./nav-core";

const D1 = 86_400_000;

/**
 * Refresh the NAV ledger from the broker. Every main tick: the chain is recomputed from a year of Alpaca history
 * (closed sessions) plus the session in progress (the one after the newest closed session) from the live
 * account — cheap and idempotent. The session in progress also gets its per-trade marks and attribution; earlier
 * sessions keep what they were given on their own day.
 */
export async function updateNav(now: number): Promise<{ day: string | null; rows: number; attributed: boolean }> {
  const [history, account, positions, open] = await Promise.all([alpaca.portfolioHistory({ period: "1A", timeframe: "1D" }), alpaca.account(), alpaca.positions(), getOpenTrades()]);
  const db = getSupabase();
  const stamp = new Date(now).toISOString();
  const closed = historyPoints(history);
  const lastClosed = closed.at(-1)?.day ?? new Date(now - D1).toISOString().slice(0, 10);
  const sessions = await marketCalendar(lastClosed, new Date(Date.parse(`${lastClosed}T00:00:00Z`) + 10 * D1).toISOString().slice(0, 10)).catch(() => []);
  const live = liveSessionPoint({ day: sessionAfter(lastClosed, sessions.map((x) => x.date)), equity: Number(account.equity), last_equity: Number(account.last_equity) });
  const { data: storedRows, error: storedErr } = await db.from("trading_nav_daily").select("day, equity, pnl, cash_flow").gte("day", new Date(now - 30 * D1).toISOString().slice(0, 10));
  if (storedErr) throw new Error(`nav stored: ${storedErr.message}`);
  const stored: NavPoint[] = (storedRows ?? []).map((r) => ({ day: String(r.day), equity: Number(r.equity), pnl: Number(r.pnl), cash_flow: Number(r.cash_flow) }));
  const plan = planNavPoints({ history: closed, stored, live });
  const rows = chainNav(plan.points, BOOK_INCEPTION);
  if (!rows.length) return { day: null, rows: 0, attributed: false };
  const current = rows[rows.length - 1];

  const { error: chainErr } = await db.from("trading_nav_daily").upsert(rows.map((r) => ({ ...r, updated_at: stamp })), { onConflict: "day", defaultToNull: false });
  if (chainErr) throw new Error(`nav chain: ${chainErr.message}`);
  if (plan.stale.length) await db.from("trading_nav_daily").delete().in("day", plan.stale);

  const [closedRes, prevRes] = await Promise.all([
    db
      .from("trading_trades")
      .select("id, setup, strategy_version, realized_pnl")
      .eq("state", "CLOSED")
      .not("broker", "is", null)
      .gte("closed_at", new Date(now - 3 * D1).toISOString()),
    db.from("trading_nav_daily").select("day, marks").lt("day", current.day).order("day", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (closedRes.error) throw new Error(`nav closed trades: ${closedRes.error.message}`);
  const prevMarks = (prevRes.data?.marks as Marks | null) ?? null;
  const marks = buildMarks({
    positions: positions.map((p) => ({ symbol: fromAlpacaPositionSymbol(p.symbol), unrealized_pl: Number(p.unrealized_pl), dust: isDustPosition(p) })),
    open: open.filter((t) => t.broker).map((t) => ({ id: t.id, symbol: t.symbol, setup: t.setup, strategy_version: t.strategy_version })),
    closed: (closedRes.data ?? []).map((c) => ({ id: String(c.id), setup: (c.setup as string) ?? null, strategy_version: (c.strategy_version as string) ?? null, realized_pnl: c.realized_pnl === null ? null : Number(c.realized_pnl) })),
    prev: prevMarks,
  });
  const attr = attributeDay(prevMarks, marks, current.pnl);
  const { error } = await db
    .from("trading_nav_daily")
    .update({ marks, by_strategy: attr?.by_strategy ?? null, unattributed: attr?.unattributed ?? null, updated_at: stamp })
    .eq("day", current.day);
  if (error) throw new Error(`nav attribution: ${error.message}`);
  return { day: current.day, rows: rows.length, attributed: attr !== null };
}
