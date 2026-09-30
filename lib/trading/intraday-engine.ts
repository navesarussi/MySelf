import { getSupabase } from "@/lib/supabase";
import { isIntradayManaged } from "./engine";
import { resurrectDesyncedTrades } from "./broker/resurrect";
import { runBrokerReconciliation } from "./broker/run-reconciliation";
import { settleBrokerTrades, SETTLE_LOOKBACK_MS } from "./broker/settle";
import { loadIntradayFrames, type IntradaySymbol } from "./intraday-data";
import { runCloseSleeve } from "./book/close-sleeve";
import { providerSymbolFor, refreshIntradayUniverse } from "./intraday-universe";
import { getOpenTrades, getSettings, logEvent, updateSettings, type TradeRow } from "./store";
import {
  LOCK_MS,
  iso,
  stockSession,
  type IntradaySummary,
  type StockSession,
} from "./intraday-context";
import { advanceIntraday } from "./intraday-advance";
import { rateEnteredTriggers } from "./intraday-rate";
import type { IntradayFeatures, IntradayFrames } from "./strategy/intraday";
import { runHealthChecks } from "./fund/health";

/**
 * מערכת המסחר — intraday tick, 1 minute after every 5m close (Supabase pg_cron "1-59/5 * * * *" → /api/trading/intraday-tick).
 * Universe: liquid crypto (24/7) + liquid US stocks/ETFs (regular session only), rebuilt daily.
 * Setups on closed 15m bars, entry timing + position management on closed 5m bars.
 * הסוכן מסחר is in RATING-ONLY mode for automatic entries; manual entries (search button) are planned by the agent.
 * Idempotent: triggers are unique per (symbol, INTRADAY, setup bar, strategy) and positions only step unseen bars.
 *
 * The stages live in their own modules; this file is the tick.
 */

// The surface trade-finder.ts and the API route already import from here, kept
// so splitting the tick into stages moved nobody's import path.
export { STOCK_SESSION, intradayEnvelopeBlocks, loadIntradayAccount, sizeIntraday, stockSession } from "./intraday-context";
export {
  insertIntradayTrade,
  placeIntradayBrokerEntry,
  ratingSnapshotFor,
  scannableSymbols,
  syncBrokerEntryNow,
} from "./intraday-trade";
export type { IntradayAccount, IntradaySummary, StockSession } from "./intraday-context";
export type { IntradayFeatures, IntradayFrames };

async function acquireLock(now: number): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("trading_settings")
    .update({ intraday_lock_until: iso(now + LOCK_MS) })
    .eq("id", true)
    .or(`intraday_lock_until.is.null,intraday_lock_until.lt.${iso(now)}`)
    .select("id");
  if (error) throw new Error(`intraday lock: ${error.message}`);
  return Boolean(data?.length);
}

// ── Tick ───────────────────────────────────────────────────────────────────

/** Symbols to load: the scannable set + open positions + market references (BTC always, SPY while stocks trade). */
export function symbolsToLoad(scannable: IntradaySymbol[], open: Pick<TradeRow, "symbol" | "asset_class">[], session: StockSession): IntradaySymbol[] {
  const map = new Map<string, IntradaySymbol>();
  for (const u of scannable) map.set(u.symbol, u);
  for (const t of open) if (!map.has(t.symbol)) map.set(t.symbol, { symbol: t.symbol, asset_class: t.asset_class, provider_symbol: providerSymbolFor(t.symbol, t.asset_class) });
  if (!map.has("BTC")) map.set("BTC", { symbol: "BTC", asset_class: "CRYPTO_MAJOR", provider_symbol: "BTCUSDT" });
  if (session.open && !map.has("SPY")) map.set("SPY", { symbol: "SPY", asset_class: "STOCK", provider_symbol: "SPY" });
  return [...map.values()];
}


export async function runIntradayTick(now = Date.now()): Promise<IntradaySummary> {
  const started = Date.now();
  const summary: IntradaySummary = { positions_updated: 0, closed: 0, triggers: 0, entries: 0, blocked: 0, ratings: 0, symbols: 0, stocks_open: false, errors: [] };
  const settings = await getSettings();
  if (!settings.intraday_enabled) return { ...summary, skipped_reason: "intraday_disabled" };
  if (!(await acquireLock(now))) return { ...summary, skipped_reason: "locked" };
  try {
    const today = iso(now).slice(0, 10);
    // Daily universe rebuild from 12:00 UTC (before the US open), using yesterday's completed daily bars.
    if (settings.last_intraday_universe_date !== today && new Date(now).getUTCHours() >= 12) {
      try {
        summary.universe_refreshed = await refreshIntradayUniverse(now);
        await updateSettings({ last_intraday_universe_date: today });
      } catch (err) {
        summary.errors.push(`universe_refresh: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`);
      }
    }
    const session = await stockSession(now);
    summary.stocks_open = session.open;
    if (settings.execution_venue === "ALPACA_PAPER") {
      try {
        await resurrectDesyncedTrades(now);
      } catch (err) {
        summary.errors.push(`resurrect: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
      }
      try {
        const rec = await runBrokerReconciliation(now);
        if (rec.errors.length) summary.errors.push(...rec.errors.map((e) => `reconcile: ${e}`));
      } catch (err) {
        summary.errors.push(`reconcile: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
      }
    }
    const managed = (await getOpenTrades()).filter((t) => isIntradayManaged(t.strategy_version));
    // With automatic entries retired only the open positions (and the market references) need bars.
    const frames = await loadIntradayFrames(symbolsToLoad([], managed, session), now, summary.errors);
    summary.symbols = frames.size;
    const lastPrices = new Map([...frames].map(([s, lf]) => [s, lf.lastPrice]));

    await advanceIntraday(managed, frames, lastPrices, session, now, summary);
    if (settings.execution_venue === "ALPACA_PAPER") {
      // Books from the fills before the account is loaded, so halts and equity see the real P&L.
      try {
        summary.settled = (await settleBrokerTrades({ now, sinceMs: now - SETTLE_LOOKBACK_MS })).settled;
      } catch (err) {
        summary.errors.push(`settle: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
      }
    }

    if (settings.execution_venue === "ALPACA_PAPER") {
      // The book's next-day sleeve trades the closing auction; this 5-minute tick is the one that lands in its window.
      try {
        const close = await runCloseSleeve(now);
        if (close?.errors.length) summary.errors.push(...close.errors.map((e) => `close_sleeve: ${e}`));
      } catch (err) {
        summary.errors.push(`close_sleeve: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
      }
    }

    if (settings.phase !== "PAPER" && settings.phase !== "SHADOW") summary.skipped_reason = `phase_${settings.phase.toLowerCase()}`;
    else if (settings.kill_switch_active) summary.skipped_reason = "kill_switch_active";
    // Automatic intraday entries are retired (2026-09-26): measured with Alpaca's real costs they lost
    // −0.39R/trade on crypto 15m/5m and −0.24R on US stocks (docs/trading/research-2026-09.md). Open
    // intraday positions are still managed to their exits; the "search trade" button still enters manually.
    else summary.skipped_reason = "intraday_entries_retired";

    await rateEnteredTriggers(now, started, summary);
  } catch (err) {
    summary.errors.push(`intraday_tick: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    summary.duration_ms = Date.now() - started;
    if (summary.errors.length) {
      const noisy = summary.errors.filter((e) => /insufficient|40310000|alpaca_403/i.test(e));
      const rest = summary.errors.filter((e) => !/insufficient|40310000|alpaca_403/i.test(e));
      const payload = rest.length ? rest : noisy.slice(0, 1);
      await logEvent({
        kind: "INTRADAY_ERRORS",
        severity: payload.length > 5 ? "critical" : "warn",
        message: payload.slice(0, 5).join(" | ").slice(0, 900),
        data: { errors: summary.errors, suppressed_insufficient: noisy.length > 1 ? noisy.length - 1 : 0 },
      }).catch(() => null);
    }
    // Watches the main tick's heartbeat (a tick cannot report its own death).
    await runHealthChecks(now, "intraday", summary.errors).catch(() => null);
    await getSupabase()
      .from("trading_settings")
      .update({ intraday_lock_until: null, last_intraday_tick_at: iso(now), last_intraday_summary: summary })
      .eq("id", true);
  }
  return summary;
}
