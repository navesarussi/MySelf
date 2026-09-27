import { alpaca, fromAlpacaPositionSymbol, isAlpacaConfigured, isDustPosition } from "./broker/alpaca";
import { marketClock } from "./broker/alpaca-data";
import { loadAccount, type Account, type TickSummary } from "./engine";
import { accountRiskState } from "./tick-context";
import { RISK_ENVELOPE } from "./config";
import { brokerEquity } from "./account-equity";
import { checkAccountEntry, type EnvelopeBlock } from "./risk-envelope";
import { buildTradePlan } from "./sizing";
import { getOpenTrades, type TradingSettings } from "./store";
import { usSessionMinutes } from "./veto";
import type { AssetClass, TradePlan } from "./types";

/**
 * Shared ground for the intraday tick and the "search trade" button: timing
 * constants, the session clock, the account the envelope sizes against, and the
 * summary each stage fills in.
 *
 * Split out of intraday-engine.ts so the stages (advance, scan, rate) can live
 * in their own files without importing the tick back and forming a cycle.
 */

export const TICK_BUDGET_MS = 80_000;
export const LOCK_MS = 150_000;
/** A confirmation older than this (missed ticks) is stale — the entry price is no longer available. */
export const MAX_CONFIRM_AGE_MS = 10 * 60_000;
export const MAX_RATINGS_PER_TICK = 4;
export const CHART_BARS_BEFORE = 96;
/** Stocks: no new entries in the first 15 / last 30 minutes; flat 10 minutes before the close. */
export const STOCK_SESSION = Object.freeze({ NO_ENTRY_FIRST_MIN: 15, NO_ENTRY_LAST_MIN: 30, FLATTEN_LAST_MIN: 10 });

export const iso = (ms: number) => new Date(ms).toISOString();

export type IntradaySummary = Pick<TickSummary, "positions_updated" | "closed" | "triggers" | "entries" | "blocked" | "errors" | "skipped_reason" | "duration_ms"> & {
  ratings: number;
  symbols: number;
  /** Trades whose P&L/R were booked from Alpaca's fills this tick. */
  settled?: number;
  stocks_open: boolean;
  universe_refreshed?: { crypto: number; stocks: number };
};

export type StockSession = { open: boolean; canEnter: boolean; mustFlatten: boolean };

export async function stockSession(now: number): Promise<StockSession> {
  let open = false;
  if (isAlpacaConfigured()) {
    try {
      open = (await marketClock()).is_open; // authoritative on holidays / half days
    } catch {
      const s = usSessionMinutes(new Date(now));
      open = s.weekday && s.sinceOpen >= 0 && s.untilClose > 0;
    }
  }
  const s = usSessionMinutes(new Date(now));
  return {
    open,
    canEnter: open && s.sinceOpen >= STOCK_SESSION.NO_ENTRY_FIRST_MIN && s.untilClose > STOCK_SESSION.NO_ENTRY_LAST_MIN,
    mustFlatten: !open || s.untilClose <= STOCK_SESSION.FLATTEN_LAST_MIN,
  };
}

export type IntradayAccount = {
  account: Account;
  buyingPower: { crypto: number | null; stock: number | null };
  useBroker: boolean;
  /** Symbols Alpaca holds (beyond fee dust) or has open orders on — a new entry there is a wash trade. */
  brokerHeld: Set<string>;
};

export async function loadIntradayAccount(settings: TradingSettings, lastPrices: Map<string, number>, now: number, errors: string[]): Promise<IntradayAccount> {
  const account = await loadAccount(settings, await getOpenTrades(), lastPrices, now);
  const useBroker = settings.phase === "PAPER" && settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured();
  const buyingPower = { crypto: null as number | null, stock: null as number | null };
  const brokerHeld = new Set<string>();
  if (useBroker) {
    try {
      const [positions, orders] = await Promise.all([alpaca.positions(), alpaca.allOpenOrders()]);
      for (const p of positions) if (!isDustPosition(p)) brokerHeld.add(fromAlpacaPositionSymbol(p.symbol));
      for (const o of orders) brokerHeld.add(fromAlpacaPositionSymbol(o.symbol));
    } catch (err) {
      errors.push(`alpaca_positions: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
    try {
      const acct = await alpaca.account();
      // See brokerEquity: an unusable figure must not reach peak_equity.
      const broker = brokerEquity(acct.equity);
      if (broker.ok) account.equity = broker.equity;
      else errors.push(broker.reason);
      const crypto = Number(acct.non_marginable_buying_power ?? acct.cash);
      const stock = Number(acct.buying_power);
      buyingPower.crypto = Number.isFinite(crypto) ? crypto : null;
      buyingPower.stock = Number.isFinite(stock) ? stock : null;
    } catch (err) {
      errors.push(`alpaca_account: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
  return { account, buyingPower, useBroker, brokerHeld };
}

/**
 * Account envelope for a live entry (search button): every limit in % of equity (checkAccountEntry).
 * `riskUsd` is the entry's own risk; a list preview that has not sized yet passes the per-trade cap.
 */
export function intradayEnvelopeBlocks(settings: TradingSettings, account: Account, symbol: string, riskUsd?: number): EnvelopeBlock[] {
  const risk = riskUsd ?? RISK_ENVELOPE.MAX_RISK_PER_TRADE.STOCK * account.equity;
  return checkAccountEntry(accountRiskState(settings, account), symbol, risk);
}

export function sizeIntraday(input: { entry: number; stop: number; assetClass: AssetClass; ia: IntradayAccount; riskScale: number }): TradePlan | null {
  const bp = input.assetClass === "STOCK" ? input.ia.buyingPower.stock : input.ia.buyingPower.crypto;
  return buildTradePlan({
    entry: input.entry,
    stopDistance: input.entry - input.stop,
    equity: input.ia.account.equity,
    assetClass: input.assetClass,
    riskScale: input.riskScale,
    maxNotional: bp !== null ? Math.max(0, bp * 0.95) : undefined,
  });
}
