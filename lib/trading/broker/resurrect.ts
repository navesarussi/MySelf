import { alpaca, fromAlpacaPositionSymbol, isAlpacaConfigured, isDustPosition } from "./alpaca";
import { revertFailedBrokerClose } from "./revert-close";
import { matchBrokerOrphans } from "./reconcile";
import { getClosedTrades, getOpenTrades, getSettings, logEvent, simColumns, symbolsLoggedOn, updateTrade } from "../store";
import { BROKER_ORPHAN_KIND, orphanReportDay, orphansToReport } from "./orphan-report";

/**
 * Journal said CLOSED, Alpaca still holds — put the trade back to OPEN so the
 * trail can keep working and the books match the broker.
 */
export async function resurrectDesyncedTrades(now: number): Promise<number> {
  if (!isAlpacaConfigured()) return 0;
  const settings = await getSettings();
  if (settings.execution_venue !== "ALPACA_PAPER") return 0;
  const [held, open, closed] = await Promise.all([
    alpaca.positions(),
    getOpenTrades(),
    getClosedTrades({ sinceIso: settings.phase_started_at }),
  ]);
  const closedBySymbol = new Map<string, (typeof closed)[number]>();
  for (const t of closed) {
    if (t.broker !== "ALPACA_PAPER" || t.track !== "AGENT") continue;
    if (!closedBySymbol.has(t.symbol)) closedBySymbol.set(t.symbol, t);
  }
  // A settled trade's fills prove it went flat — a holding on its symbol belongs to something else.
  for (const [symbol, t] of closedBySymbol) if (t.broker_settled_at) closedBySymbol.delete(symbol);
  // Fee dust left after a full sale is not a position — reopening a trade over
  // it booked the dust sale as the exit (PEPE −54R).
  const match = matchBrokerOrphans(
    held.filter((p) => !isDustPosition(p)).map((p) => ({ symbol: p.symbol, qty: Number(p.qty) })),
    new Set(open.map((t) => t.symbol)),
    closedBySymbol
  );
  // A position the strategy never owned stays until a human acts on it, so it is
  // reported once a day rather than on every 5-minute tick — that spam was 80%
  // of the whole trading event log.
  //
  // Its own kind, not BROKER_DESYNC: three unrelated conditions shared that one
  // (this, a trade reopened because the broker still held it, and a failed
  // broker close), so deduping on the shared kind would have silenced a genuine
  // alert about a different problem on the same symbol.
  if (match.unknownSymbols.length) {
    const day = orphanReportDay(new Date(now));
    const fresh = orphansToReport(match.unknownSymbols, await symbolsLoggedOn(BROKER_ORPHAN_KIND, day));
    for (const symbol of fresh) {
      await logEvent({
        kind: BROKER_ORPHAN_KIND,
        symbol,
        severity: "warn",
        message: `${symbol}: פוזיציה בברוקר בלי עסקה פתוחה ביומן`,
      });
    }
  }
  let n = 0;
  for (const id of match.reopenIds) {
    const trade = closed.find((t) => t.id === id);
    if (!trade) continue;
    const pos = held.find((p) => fromAlpacaPositionSymbol(p.symbol) === trade.symbol);
    const qty = Number(pos?.qty);
    if (!(qty > 0)) continue;
    const p = { ...trade.sim_state };
    revertFailedBrokerClose(p);
    p.size = qty;
    p.state = p.entry_price !== null && p.stop_price >= p.entry_price ? "RISK_FREE" : "OPEN";
    p.closed_at = null;
    p.exit_price = null;
    p.exit_reason = null;
    await updateTrade(trade.id, {
      ...simColumns(p),
      realized_r: null,
      realized_pnl: null,
      last_bar_time: new Date(now).toISOString(),
      broker_status: "resurrected",
      broker_settled_at: null,
      broker_stop_order_id: null,
      events: [...(trade.events ?? []), { type: "STOP_MOVED", from: p.stop_price, to: p.stop_price, at: now, note: "resurrected — broker still held" }],
    });
    await logEvent({
      kind: "BROKER_DESYNC",
      symbol: trade.symbol,
      severity: "warn",
      message: `${trade.symbol}: נפתחה מחדש ביומן — הברוקר עדיין מחזיק`,
      data: { trade_id: trade.id, qty },
      push: true,
    });
    n += 1;
  }
  return n;
}
