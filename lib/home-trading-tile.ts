import type { HomeTradingSnapshot } from "./home-snapshots";

export type HomeTradingTileValues = {
  equity: number;
  starting_equity: number;
  kill_switch_active: boolean;
};

/** Prefer live equity query data; fall back to legacy /api/v1/home `trading`. */
export function resolveHomeTradingTile(
  live: HomeTradingTileValues | null | undefined,
  home: HomeTradingSnapshot | null | undefined
): HomeTradingTileValues | null {
  const equity = live?.equity ?? home?.equity;
  if (equity == null || !Number.isFinite(equity)) return null;
  return {
    equity,
    starting_equity: live?.starting_equity ?? home?.starting_equity ?? equity,
    kill_switch_active: Boolean(live?.kill_switch_active ?? home?.kill_switch_active),
  };
}
