import { getSupabase } from "@/lib/supabase";
import { alpaca, fromAlpacaPositionSymbol, isDustPosition } from "../broker/alpaca";
import { getOpenTrades } from "../store";
import { attributeDay, BOOK_INCEPTION, buildMarks, chainNav, currentSessionDay, historyPoints, liveSessionPoint, type Marks } from "./nav-core";

const D1 = 86_400_000;

/**
 * Refresh the NAV ledger from the broker. Every main tick: the chain is recomputed from a year of Alpaca history
 * (closed sessions) plus the session in progress from the live account — cheap and idempotent. The current
 * session also gets its per-trade marks and attribution; earlier sessions keep what they were given on their day.
 */
export async function updateNav(now: number): Promise<{ day: string | null; rows: number; attributed: boolean }> {
  const [history, account, positions, open] = await Promise.all([alpaca.portfolioHistory({ period: "1A", timeframe: "1D" }), alpaca.account(), alpaca.positions(), getOpenTrades()]);
  const points = historyPoints(history);
  const today = currentSessionDay(now);
  const live = liveSessionPoint({ day: today, equity: Number(account.equity), last_equity: Number(account.last_equity) });
  if (live && !points.some((p) => p.day >= today)) points.push(live);
  const rows = chainNav(points, BOOK_INCEPTION);
  if (!rows.length) return { day: null, rows: 0, attributed: false };
  const db = getSupabase();
  const current = rows[rows.length - 1];
  const stamp = new Date(now).toISOString();

  const { error: chainErr } = await db.from("trading_nav_daily").upsert(rows.map((r) => ({ ...r, updated_at: stamp })), { onConflict: "day", defaultToNull: false });
  if (chainErr) throw new Error(`nav chain: ${chainErr.message}`);
  // A live row for a day Alpaca never turned into a session (a holiday) must not stay in the chain.
  const lastClosed = points.filter((p) => p !== live).at(-1)?.day ?? "";
  await db.from("trading_nav_daily").delete().gt("day", lastClosed).neq("day", current.day);

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
