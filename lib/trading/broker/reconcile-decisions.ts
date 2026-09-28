import type { AssetClass } from "../types";

/** Broker position snapshot used by the reconciliation planner. */
export type BrokerHold = {
  symbol: string;
  assetClass: AssetClass;
  qty: number;
  /** Sellable quantity after reserved open orders (Alpaca qty_available). */
  qtyAvailable: number;
};

/** Open journal row snapshot for reconciliation planning. */
export type JournalOpen = {
  id: string;
  symbol: string;
  assetClass: AssetClass;
  qty: number;
  state: string;
  entryConfirmed: boolean;
  brokerEntryOrderId: string | null;
  clientOrderId: string | null;
  brokerStatus: string | null;
};

const ENTRY_ORDER_OPEN = new Set([
  "new",
  "accepted",
  "pending_new",
  "partially_filled",
  "pending_cancel",
  "pending_replace",
  "accepted_for_bidding",
  "stopped",
  "suspended",
  "calculated",
]);

/** Entry order still working or only partially filled — journal qty may lag the broker. */
export function isEntryOrderOpen(status: string | null | undefined): boolean {
  if (!status) return false;
  return ENTRY_ORDER_OPEN.has(status.toLowerCase());
}

export type ReconcileAction =
  | { kind: "close_orphan"; symbol: string; assetClass: AssetClass; qty: number }
  | { kind: "close_journal_flat"; tradeId: string; symbol: string; exitPrice: number | null; unknown: boolean }
  | { kind: "sync_qty"; tradeId: string; symbol: string; brokerQty: number; journalQty: number }
  | { kind: "resolve_ambiguous_order"; tradeId: string; symbol: string; clientOrderId: string };

const CRYPTO_QTY_REL_TOL = 0.005;

/** Entry is confirmed when the broker (or sim) recorded a fill, not merely a resting order. */
export function entryConfirmedAtBroker(input: {
  entry_price: number | null;
  broker_filled_qty: number | null;
  sim_state: { opened_at: number | null; state: string };
}): boolean {
  if (input.entry_price !== null && input.entry_price > 0) return true;
  if ((input.broker_filled_qty ?? 0) > 0) return true;
  if (input.sim_state.opened_at !== null && input.sim_state.state !== "PENDING") return true;
  return false;
}

export function qtyMismatch(journalQty: number, brokerQty: number, assetClass: AssetClass): boolean {
  if (!(journalQty > 0) || !(brokerQty > 0)) return journalQty !== brokerQty;
  if (assetClass === "STOCK") return Math.abs(journalQty - brokerQty) >= 1;
  const base = Math.max(journalQty, brokerQty);
  return Math.abs(journalQty - brokerQty) / base > CRYPTO_QTY_REL_TOL;
}

/**
 * Pure reconciliation plan: compare broker holdings to open journal rows.
 * Does not mutate anything — safe to unit-test with mocked inputs.
 */
export function planReconciliation(input: {
  held: BrokerHold[];
  openTrades: JournalOpen[];
  reopenTradeIds: string[];
  reopenSymbols: Set<string>;
}): ReconcileAction[] {
  const actions: ReconcileAction[] = [];
  const openBySymbol = new Map<string, JournalOpen>();
  for (const t of input.openTrades) openBySymbol.set(t.symbol, t);

  const heldSymbols = new Set<string>();
  for (const pos of input.held) {
    if (pos.qty === 0) continue;
    heldSymbols.add(pos.symbol);
    if (pos.qty < 0) {
      actions.push({ kind: "close_orphan", symbol: pos.symbol, assetClass: pos.assetClass, qty: Math.abs(pos.qty) });
      continue;
    }
    const journal = openBySymbol.get(pos.symbol);
    if (!journal) {
      if (input.reopenSymbols.has(pos.symbol)) continue;
      actions.push({ kind: "close_orphan", symbol: pos.symbol, assetClass: pos.assetClass, qty: pos.qty });
      continue;
    }
    if (isEntryOrderOpen(journal.brokerStatus)) continue;
    if (qtyMismatch(journal.qty, pos.qty, pos.assetClass)) {
      actions.push({ kind: "sync_qty", tradeId: journal.id, symbol: pos.symbol, brokerQty: pos.qty, journalQty: journal.qty });
    }
  }

  for (const t of input.openTrades) {
    if (t.state === "PENDING" && t.clientOrderId && !t.brokerEntryOrderId && !t.entryConfirmed) {
      actions.push({ kind: "resolve_ambiguous_order", tradeId: t.id, symbol: t.symbol, clientOrderId: t.clientOrderId });
      continue;
    }
    if (t.state !== "OPEN" && t.state !== "RISK_FREE") continue;
    if (heldSymbols.has(t.symbol)) continue;
    if (t.entryConfirmed) {
      actions.push({ kind: "close_journal_flat", tradeId: t.id, symbol: t.symbol, exitPrice: null, unknown: false });
    } else {
      actions.push({ kind: "close_journal_flat", tradeId: t.id, symbol: t.symbol, exitPrice: null, unknown: true });
    }
  }

  void input.reopenTradeIds;
  return actions;
}

/** Dedupe noisy reconciliation events: one report per symbol+action per UTC day. */
export function reconcileEventKey(action: ReconcileAction): string {
  switch (action.kind) {
    case "close_orphan":
      return `orphan:${action.symbol}`;
    case "close_journal_flat":
      return `flat:${action.symbol}:${action.tradeId}`;
    case "sync_qty":
      return `qty:${action.symbol}:${action.tradeId}`;
    case "resolve_ambiguous_order":
      return `order:${action.symbol}:${action.tradeId}`;
  }
}

export function reconcileEventsToEmit(actions: ReconcileAction[], alreadyLogged: Iterable<string>): ReconcileAction[] {
  const seen = new Set<string>();
  for (const k of alreadyLogged) seen.add(k);
  const out: ReconcileAction[] = [];
  for (const a of actions) {
    const key = reconcileEventKey(a);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}
