import { EQUITY_ETFS, ROTATION_ETFS } from "./strategy/etf-lists";

/**
 * Which strategies an open trade can be handed to (the trade card's "move to strategy"). Pure — the app builds
 * its menu from it and the server validates with it. MANUAL = no strategy exits: only the stop and target.
 */
export const STRATEGY_CHOICES = ["CRYPTO_TREND", "MOMENTUM", "REVERSAL", "ASSET_ROTATION", "IBS_CLOSE", "MANUAL"] as const;
export type StrategyChoice = (typeof STRATEGY_CHOICES)[number];

/** Strategies whose exit is a broker take-profit (a real target), not a signal. */
export const BRACKET_STRATEGIES: ReadonlySet<string> = new Set(["IBS_CLOSE"]);
/** The bracket strategy's take-profit in R (IBS_CLOSE: 1.5×ATR over a 1×ATR stop). */
export const BRACKET_TARGET_R = 1.5;

export function strategyChoices(t: { symbol: string; asset_class: string; setup: string | null; strategy_version?: string | null }): StrategyChoice[] {
  const out: StrategyChoice[] = [];
  if (t.asset_class === "STOCK") {
    out.push("REVERSAL", "MOMENTUM");
    if (ROTATION_ETFS.has(t.symbol)) out.push("ASSET_ROTATION");
    if (EQUITY_ETFS.has(t.symbol)) out.push("IBS_CLOSE");
  } else out.push("CRYPTO_TREND");
  out.push("MANUAL");
  const current = t.strategy_version === "manual" || !t.setup ? "MANUAL" : t.setup;
  return out.filter((x) => x !== current);
}

/** Display order of strategy groups: horizon from short to long, then the retired and manual ones. */
export const STRATEGY_ORDER = ["IBS_CLOSE", "REVERSAL", "CRYPTO_TREND", "MOMENTUM", "ASSET_ROTATION", "PULLBACK", "MANUAL"] as const;

/** Group key of a trade: its book strategy, or MANUAL for everything outside the book's strategies. */
export function strategyKey(t: { setup: string | null; strategy_version?: string | null }): string {
  if (t.strategy_version !== undefined && t.strategy_version !== null && t.strategy_version !== "book") return "MANUAL";
  return t.setup ?? "MANUAL";
}
