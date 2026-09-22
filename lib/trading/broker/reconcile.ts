import { fromAlpacaPositionSymbol } from "./alpaca";

export type OrphanMatch = { reopenIds: string[]; unknownSymbols: string[] };

/**
 * Broker positions with no open journal row: either a trade we marked CLOSED
 * too early (reopen it) or something the strategy never owned (leave it).
 */
export function matchBrokerOrphans(
  held: { symbol: string; qty: number }[],
  openSymbols: Set<string>,
  closedBySymbol: Map<string, { id: string }>
): OrphanMatch {
  const reopenIds: string[] = [];
  const unknownSymbols: string[] = [];
  for (const pos of held) {
    if (!(pos.qty > 0)) continue;
    const symbol = fromAlpacaPositionSymbol(pos.symbol);
    if (openSymbols.has(symbol)) continue;
    const closed = closedBySymbol.get(symbol);
    if (closed) reopenIds.push(closed.id);
    else unknownSymbols.push(symbol);
  }
  return { reopenIds, unknownSymbols };
}
