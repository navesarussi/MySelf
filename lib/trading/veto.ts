import { VETO_RULES, isCrypto } from "./config";
import type { AssetClass, TradingMode } from "./types";

/** Stage 4 — deterministic hard vetoes, evaluated before the agent is ever called. */
export type VetoCode =
  | "EARNINGS_WINDOW"
  | "EARNINGS_DATA_UNAVAILABLE"
  | "MACRO_EVENT_DAY"
  | "EXTREME_FUNDING"
  | "FUNDING_DATA_UNAVAILABLE"
  | "TOKEN_UNLOCK"
  | "SESSION_EDGE"
  | "MARKET_CLOSED";

export type CalendarEvent = {
  kind: "CPI" | "FOMC" | "EARNINGS" | "TOKEN_UNLOCK" | "OTHER_MACRO";
  /** YYYY-MM-DD (US Eastern for stocks/macro, UTC for crypto). */
  date: string;
  symbol: string | null;
};

export type VetoInput = {
  symbol: string;
  asset_class: AssetClass;
  mode: TradingMode;
  /** Decision time. */
  now: Date;
  calendar: CalendarEvent[];
  /**
   * Symbols with earnings within the window from the live earnings calendar;
   * null = the feed failed (fail closed for stocks).
   */
  earnings_symbols: Set<string> | null;
  /** Latest perp funding rate (crypto); null = unavailable; undefined = not a perp market. */
  funding_rate?: number | null;
};

export function isoDateInZone(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return parts;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Next `n` weekday dates starting today (holidays are ignored — this errs toward more vetoes). */
export function nextTradingDays(fromIso: string, n: number): string[] {
  const out: string[] = [];
  let cur = fromIso;
  while (out.length < n) {
    const dow = new Date(`${cur}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Minutes since US regular session open (09:30 ET) and until close (16:00 ET). */
export function usSessionMinutes(now: Date): { sinceOpen: number; untilClose: number; weekday: boolean } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const mins = hour * 60 + minute;
  return { sinceOpen: mins - 570, untilClose: 960 - mins, weekday: wd !== "Sat" && wd !== "Sun" };
}

export function evaluateVetoes(input: VetoInput): VetoCode[] {
  const vetoes: VetoCode[] = [];
  const { calendar, now } = input;
  const crypto = isCrypto(input.asset_class);
  const today = isoDateInZone(now, crypto ? "UTC" : "America/New_York");

  if (calendar.some((e) => (e.kind === "CPI" || e.kind === "FOMC") && e.date === today)) {
    vetoes.push("MACRO_EVENT_DAY");
  }

  if (!crypto) {
    const window = new Set(nextTradingDays(today, VETO_RULES.EARNINGS_WINDOW_TRADING_DAYS + 1));
    const manual = calendar.some((e) => e.kind === "EARNINGS" && e.symbol === input.symbol && window.has(e.date));
    if (manual || input.earnings_symbols?.has(input.symbol)) vetoes.push("EARNINGS_WINDOW");
    // ETFs have no earnings; everything else fails closed when the feed is down.
    else if (input.earnings_symbols === null && !ETF_SYMBOLS.has(input.symbol)) vetoes.push("EARNINGS_DATA_UNAVAILABLE");

    if (input.mode === "INTRADAY") {
      const s = usSessionMinutes(now);
      if (!s.weekday || s.sinceOpen < 0 || s.untilClose <= 0) vetoes.push("MARKET_CLOSED");
      else if (s.sinceOpen < VETO_RULES.SESSION_EDGE_MINUTES || s.untilClose < VETO_RULES.SESSION_EDGE_MINUTES) {
        vetoes.push("SESSION_EDGE");
      }
    }
  } else {
    if (input.funding_rate === null) vetoes.push("FUNDING_DATA_UNAVAILABLE");
    else if (input.funding_rate !== undefined && Math.abs(input.funding_rate) >= VETO_RULES.EXTREME_FUNDING_RATE) {
      vetoes.push("EXTREME_FUNDING");
    }
    const unlockEnd = addDays(today, VETO_RULES.TOKEN_UNLOCK_WINDOW_DAYS);
    if (calendar.some((e) => e.kind === "TOKEN_UNLOCK" && e.symbol === input.symbol && e.date >= today && e.date <= unlockEnd)) {
      vetoes.push("TOKEN_UNLOCK");
    }
  }
  return vetoes;
}

export const ETF_SYMBOLS = new Set(["SPY", "QQQ", "IWM", "DIA"]);

/** Stocks: no holding through earnings — exit if earnings fall within the next trading day. */
export function mustExitBeforeEarnings(symbol: string, now: Date, calendar: CalendarEvent[], earningsNextDay: Set<string> | null) {
  if (ETF_SYMBOLS.has(symbol)) return false;
  const today = isoDateInZone(now, "America/New_York");
  const days = new Set(nextTradingDays(today, 2));
  return Boolean(earningsNextDay?.has(symbol)) || calendar.some((e) => e.kind === "EARNINGS" && e.symbol === symbol && days.has(e.date));
}
