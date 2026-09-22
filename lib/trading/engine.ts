import { getSupabase } from "@/lib/supabase";
import { D1, createFrameCache, iso, loadAccount, type TickSummary } from "./tick-context";
import { brokerEquity } from "./account-equity";
import { createBarCache, fetchEarningsSymbols } from "./market-data";
import { forceClose, openRiskR, realizedR, type PositionEvent } from "./position";
import { alpaca, flattenAtBroker, isAlpacaConfigured } from "./broker/alpaca";
import { advancePositions } from "./advance-positions";
import { dailyScreen } from "./daily-screen";
import { learnFromClosedTrades } from "./learn-loop";
import { scanDailyTrend } from "./scan-daily-trend";
import { scan } from "./scan-v2";
import { isIntradayManaged } from "./strategy-versions";
import { drawdownFromPeak, shouldTripKillSwitch } from "./risk-envelope";
import {
  ensureSeeded,
  getActivePlaybook,
  getActiveV2Params,
  getCalendar,
  getOpenTrades,
  getSettings,
  getUniverse,
  logEvent,
  simColumns,
  updateSettings,
  updateTrade,
} from "./store";
import { isoDateInZone, nextTradingDays } from "./veto";
import { round } from "./round";

/**
 * מערכת המסחר — live pipeline, run every 15 minutes (GitHub Actions → /api/trading/tick).
 * Strategy v2: context on daily, setups on 4h closes, entry timing + position management on 1h bars.
 * Idempotent: triggers are unique per (symbol, mode, bar) and positions only advance over unseen bars.
 */



/** The 4h v2 scan is replaced by the intraday strategy (testing phase); open v2 positions are still managed. */
const V2_SCAN_ENABLED = false;

export { mirrorToBroker, resolveBrokerEntry } from "./broker-mirror";
export { persistTrade } from "./advance-positions";
export { loadAccount, toSym, type Account, type TickSummary } from "./tick-context";
export { INTRADAY_STRATEGY_VERSION, MANUAL_STRATEGY_VERSION, STRATEGY_VERSION, isIntradayManaged } from "./strategy-versions";


// ── Tick ───────────────────────────────────────────────────────────────────

export async function runTick(now = Date.now()): Promise<TickSummary> {
  const started = Date.now();
  await ensureSeeded();
  let settings = await getSettings();
  const summary: TickSummary = { phase: settings.phase, positions_updated: 0, closed: 0, triggers: 0, entries: 0, vetoed: 0, blocked: 0, agent_calls: 0, lessons: 0, extensions: 0, playbook_version: null, screened: false, errors: [] };
  const cache = createBarCache(now);
  const frames = createFrameCache(cache);
  const universeRows = await getUniverse();
  const universe = new Map(universeRows.map((u) => [u.symbol, u]));
  const { params } = await getActiveV2Params();
  const today = new Date(now).toISOString().slice(0, 10);
  const calendar = await getCalendar(new Date(now - 2 * D1).toISOString().slice(0, 10));

  // Deferred risk-scale raise (friction): applies only after its cooldown.
  if (settings.pending_risk_scale !== null && settings.pending_risk_scale_at && Date.parse(settings.pending_risk_scale_at) <= now) {
    await updateSettings({ risk_scale: settings.pending_risk_scale, pending_risk_scale: null, pending_risk_scale_at: null });
    await logEvent({ kind: "RISK_SCALE", message: `הגדלת סיכון נכנסה לתוקף: ×${settings.pending_risk_scale}`, severity: "warn", push: true });
    settings = await getSettings();
  }

  const openTrades = await getOpenTrades();
  const lastPrices = new Map<string, number>();
  const earningsNext = openTrades.some((t) => t.asset_class === "STOCK") ? await fetchEarningsSymbols(nextTradingDays(isoDateInZone(new Date(now), "America/New_York"), 2)) : new Set<string>();
  // Intraday positions are managed on 5m bars by the per-minute intraday tick.
  await advancePositions({ trades: openTrades.filter((t) => !isIntradayManaged(t.strategy_version)), frames, universe, params, calendar, earningsNext, agentEnabled: settings.agent_enabled, now, summary, lastPrices });

  if (settings.agent_enabled) {
    try {
      await learnFromClosedTrades(openTrades.filter((t) => t.state === "CLOSED"), summary);
    } catch (err) {
      summary.errors.push(`learning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const stillOpen = openTrades.filter((t) => t.state === "PENDING" || t.state === "OPEN" || t.state === "RISK_FREE");
  const account = await loadAccount(settings, stillOpen, lastPrices, now);
  if (settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured()) {
    // The demo account's real equity (includes positions the strategy doesn't know about) sizes every trade.
    try {
      const acct = await alpaca.account();
      if (acct.trading_blocked || acct.account_blocked) summary.errors.push("alpaca_account_blocked");
      // Only a real figure is adopted: a NaN here reaches peak_equity, which is
      // persisted, and a NaN peak reads as zero drawdown forever — the master
      // kill switch would never trip again.
      const broker = brokerEquity(acct.equity);
      if (broker.ok) account.equity = broker.equity;
      else summary.errors.push(broker.reason);
    } catch (err) {
      summary.errors.push(`alpaca_account: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
  const peak = Math.max(settings.peak_equity, account.equity);

  // Master kill switch — full stop, manual re-arm only.
  if (!settings.kill_switch_active && shouldTripKillSwitch(account.equity, peak)) {
    for (const t of account.open) {
      const p = { ...t.sim_state };
      const brokerPx = t.broker ? await flattenAtBroker(t).catch(() => null) : null;
      const ev: PositionEvent[] = forceClose(p, brokerPx ?? lastPrices.get(t.symbol) ?? p.entry_price ?? p.entry_limit, "KILL_SWITCH", now);
      await updateTrade(t.id, { ...simColumns(p), events: [...(t.events ?? []), ...ev], ...(p.state === "CLOSED" ? { realized_r: realizedR(p), realized_pnl: p.cash_flow } : {}) });
    }
    const reason = `Drawdown ${(drawdownFromPeak(account.equity, peak) * 100).toFixed(1)}% מהשיא`;
    await updateSettings({ kill_switch_active: true, kill_switch_reason: reason, kill_switch_at: iso(now), peak_equity: peak });
    await logEvent({ kind: "KILL_SWITCH", severity: "critical", message: `מפסק ראשי הופעל: ${reason}. כל הפוזיציות נסגרו.`, push: true });
    settings = await getSettings();
  } else if (peak !== settings.peak_equity) {
    await updateSettings({ peak_equity: peak });
  }

  if (settings.last_screen_date !== today) {
    await dailyScreen(universeRows, cache, now, summary);
    await updateSettings({ last_screen_date: today });
    summary.screened = true;
  }

  if (settings.phase === "BACKTEST") summary.skipped_reason = "phase_backtest_scanning_disabled";
  else if (settings.phase === "LIVE") {
    summary.skipped_reason = "live_broker_not_connected";
    await logEvent({ kind: "LIVE_BLOCKED", severity: "critical", message: "שלב LIVE נבחר אבל אין מתאם ברוקר — אין כניסות." });
  } else if (settings.kill_switch_active) summary.skipped_reason = "kill_switch_active";
  else {
    const playbook = await getActivePlaybook();
    if (V2_SCAN_ENABLED) await scan({ settings, universe: universeRows, params, frames, cache, calendar, account, playbook, now, started, summary });
    // Daily-trend scans once per day (its signal only changes on a daily close) — gate separately from
    // v2's 4h scan, but share the SAME account/portfolio state so the combined envelope is respected.
    if (settings.last_daily_trend_scan_date !== today) {
      try {
        await scanDailyTrend({ settings, universe: universeRows, cache, account, playbook, now, started, summary });
        await updateSettings({ last_daily_trend_scan_date: today });
      } catch (err) {
        summary.errors.push(`daily_trend_scan: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  await getSupabase()
    .from("trading_equity_snapshots")
    .upsert(
      {
        day: today,
        equity: round(account.equity, 2),
        peak_equity: round(peak, 2),
        open_risk_r: account.open.reduce((s, t) => s + openRiskR(t.sim_state), 0),
        open_positions: account.open.length,
        realized_r_day: account.realizedToday,
        updated_at: iso(now),
      },
      { onConflict: "day" }
    );

  summary.duration_ms = Date.now() - started;
  if (summary.errors.length) {
    await logEvent({ kind: "TICK_ERRORS", severity: summary.errors.length > 5 ? "critical" : "warn", message: summary.errors.slice(0, 5).join(" | ").slice(0, 900), data: summary.errors });
  }
  await updateSettings({ last_tick_at: iso(now), last_tick_summary: summary });
  return summary;
}
