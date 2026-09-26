/** Shared equity display helpers — one source for Home, Trading, and widgets. */

export type TradingEquityTone = "good" | "warn" | "default";

export function tradingPnl(equity: number, startingEquity: number): number {
  if (!Number.isFinite(equity) || !Number.isFinite(startingEquity)) return 0;
  return Math.round(equity - startingEquity);
}

export function tradingEquityTone(pnl: number, killSwitch: boolean): TradingEquityTone {
  if (killSwitch) return "warn";
  if (pnl < 0) return "warn";
  if (pnl > 0) return "good";
  return "default";
}

/** Seconds since an ISO timestamp; null when unparsable. */
export function secondsSinceUpdated(updatedAt: string | null | undefined, nowMs = Date.now()): number | null {
  if (!updatedAt) return null;
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 1000));
}

export function formatUpdatedSecondsAgo(seconds: number | null, locale: "he" | "en"): string | null {
  if (seconds === null) return null;
  if (seconds < 5) return locale === "he" ? "עודכן עכשיו" : "Updated just now";
  if (seconds < 60) {
    return locale === "he" ? `עודכן לפני ${seconds} שנ׳` : `Updated ${seconds}s ago`;
  }
  const mins = Math.floor(seconds / 60);
  return locale === "he" ? `עודכן לפני ${mins} דק׳` : `Updated ${mins}m ago`;
}
