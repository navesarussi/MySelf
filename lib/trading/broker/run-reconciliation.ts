import { randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabase";
import {
  alpaca,
  alpacaSymbol,
  fromAlpacaPositionSymbol,
  isAlpacaConfigured,
  isDustPosition,
  type AlpacaFillActivity,
} from "./alpaca";
import { flattenAtBroker } from "./flatten";
import { matchBrokerOrphans } from "./reconcile";
import { toBrokerFill } from "./settle";
import { settleTrade } from "./ledger";
import {
  entryConfirmedAtBroker,
  planReconciliation,
  type BrokerHold,
  type JournalOpen,
  type ReconcileAction,
} from "./reconcile-decisions";
import { applyExternalExit, forceClose, newPendingPosition, realizedR, type SimPosition } from "../position";
import { round } from "../round";
import {
  getClosedTrades,
  getOpenTrades,
  getSettings,
  getUniverse,
  logEvent,
  simColumns,
  symbolsLoggedOn,
  updateTrade,
  type TradeRow,
} from "../store";
import { RECONCILIATION_STRATEGY_VERSION } from "../strategy-versions";

export const RECONCILE_EVENT_KIND = "BROKER_RECONCILE";
const RECONCILE_FAIL_KIND = "BROKER_RECONCILE_FAIL";

export type ReconcileSummary = { actions: number; orphans_closed: number; journal_closed: number; qty_synced: number; orders_resolved: number; errors: string[] };

function assetClassForSymbol(symbol: string, universe: Map<string, { asset_class: import("../types").AssetClass }>): import("../types").AssetClass {
  const row = universe.get(symbol);
  if (row) return row.asset_class;
  return symbol.length <= 5 ? "STOCK" : "CRYPTO_ALT";
}

function journalSnapshots(trades: TradeRow[]): JournalOpen[] {
  return trades.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    assetClass: t.asset_class,
    qty: t.sim_state.size,
    state: t.state,
    entryConfirmed: entryConfirmedAtBroker(t),
    brokerEntryOrderId: t.broker_entry_order_id,
    clientOrderId: `${t.id.slice(0, 18)}-in`,
  }));
}

function exitFromFills(trade: TradeRow, fills: AlpacaFillActivity[]): number | null {
  const sym = alpacaSymbol(trade.symbol, trade.asset_class);
  const from = (trade.sim_state.opened_at ?? Date.parse(trade.trigger_timestamp)) - 60_000;
  const brokerFills = fills.filter((f) => f.symbol === sym).map(toBrokerFill).filter((f) => f.at >= from);
  if (trade.broker_entry_order_id) {
    const s = settleTrade({
      assetClass: trade.asset_class,
      entryOrderId: trade.broker_entry_order_id,
      initialStop: trade.initial_stop_price,
      plannedRisk: trade.risk_amount,
      fills: brokerFills,
    });
    if (s && s.exit_price > 0) return s.exit_price;
  }
  const sells = brokerFills.filter((f) => f.side === "sell" && f.qty > 0 && f.price > 0).sort((a, b) => b.at - a.at);
  if (!sells.length) return null;
  const qty = sells.reduce((s, f) => s + f.qty, 0);
  const vwap = sells.reduce((s, f) => s + f.qty * f.price, 0) / qty;
  return Number.isFinite(vwap) ? vwap : null;
}

async function insertOrphanCloseRow(input: {
  symbol: string;
  assetClass: import("../types").AssetClass;
  qty: number;
  exitPrice: number | null;
  now: number;
}): Promise<string> {
  const id = randomUUID();
  const p = newPendingPosition({ asset_class: input.assetClass, entry: input.exitPrice ?? 1, stop: (input.exitPrice ?? 1) * 0.99, size: input.qty });
  p.state = "CLOSED";
  p.entry_price = null;
  p.opened_at = null;
  p.closed_at = input.now;
  p.exit_price = input.exitPrice;
  p.exit_reason = "MANUAL";
  p.size = 0;
  const nowIso = new Date(input.now).toISOString();
  const { error } = await getSupabase().from("trading_trades").insert({
    id,
    symbol: input.symbol,
    asset_class: input.assetClass,
    bucket_id: "reconciliation",
    mode: "SWING",
    track: "AGENT",
    execution: "PAPER",
    state: "CLOSED",
    trigger_timestamp: nowIso,
    trigger_snapshot: { reconciliation: "orphan_close" },
    agent_decision: "SKIP",
    agent_model_version: "reconciliation",
    prompt_version: "reconciliation",
    param_version: "reconciliation",
    entry_limit: input.exitPrice ?? 0,
    stop_price: (input.exitPrice ?? 1) * 0.99,
    initial_stop_price: (input.exitPrice ?? 1) * 0.99,
    target_price: (input.exitPrice ?? 1) * 1.01,
    position_size: input.qty,
    remaining_size: 0,
    risk_amount: 0,
    sim_state: p,
    events: [{ type: "CLOSED", price: input.exitPrice ?? 0, reason: "MANUAL", at: input.now, note: "reconciliation orphan close" }],
    strategy_version: RECONCILIATION_STRATEGY_VERSION,
    reconciliation_kind: "orphan_close",
    broker: "ALPACA_PAPER",
    baseline_enter: false,
    opened_at: null,
    closed_at: nowIso,
    exit_price: input.exitPrice,
    exit_reason: "MANUAL",
    realized_r: null,
    realized_pnl: null,
  });
  if (error) throw new Error(`orphan row: ${error.message}`);
  return id;
}

async function executeAction(action: ReconcileAction, ctx: { trades: Map<string, TradeRow>; fills: AlpacaFillActivity[]; now: number; summary: ReconcileSummary }) {
  switch (action.kind) {
    case "close_orphan": {
      const stillHeld = await alpaca.position(action.symbol, action.assetClass).catch(() => null);
      if (isDustPosition(stillHeld)) return;
      const flat = {
        symbol: action.symbol,
        asset_class: action.assetClass,
        broker_entry_order_id: null,
        broker_stop_order_id: null,
        broker_target_order_id: null,
      };
      const px = await flattenAtBroker(flat);
      const rowId = await insertOrphanCloseRow({ symbol: action.symbol, assetClass: action.assetClass, qty: action.qty, exitPrice: px, now: ctx.now });
      ctx.summary.orphans_closed += 1;
      await logEvent({
        kind: RECONCILE_EVENT_KIND,
        symbol: action.symbol,
        severity: "warn",
        message: `${action.symbol}: סגירת יתום בברוקר (${action.qty} → flat)`,
        data: { action: "orphan_close", qty: action.qty, exit_price: px, trade_id: rowId },
      });
      return;
    }
    case "sync_qty": {
      const trade = ctx.trades.get(action.tradeId);
      if (!trade || trade.state === "CLOSED" || trade.state === "CANCELLED") return;
      const p: SimPosition = { ...trade.sim_state, size: action.brokerQty, initial_size: action.brokerQty };
      await updateTrade(trade.id, {
        ...simColumns(p),
        position_size: action.brokerQty,
        reconciliation_kind: trade.reconciliation_kind ?? "qty_sync",
        events: [...(trade.events ?? []), { type: "STOP_MOVED", from: action.journalQty, to: action.brokerQty, at: ctx.now, note: "reconciliation qty sync" }],
      });
      ctx.summary.qty_synced += 1;
      await logEvent({
        kind: RECONCILE_EVENT_KIND,
        symbol: action.symbol,
        severity: "info",
        message: `${action.symbol}: סנכרון כמות יומן ${action.journalQty} → ${action.brokerQty}`,
        data: { action: "qty_sync", trade_id: action.tradeId, before: action.journalQty, after: action.brokerQty },
      });
      return;
    }
    case "close_journal_flat": {
      const trade = ctx.trades.get(action.tradeId);
      if (!trade || trade.state === "CLOSED" || trade.state === "CANCELLED") return;
      const p: SimPosition = { ...trade.sim_state };
      const events = [...(trade.events ?? [])];
      const exitPx = action.unknown ? null : exitFromFills(trade, ctx.fills);
      if (action.unknown || exitPx === null) {
        if (p.state === "PENDING") {
          p.state = "CANCELLED";
          p.cancel_reason = "RECONCILE_NO_ENTRY";
          p.closed_at = ctx.now;
          events.push({ type: "CANCELLED", reason: "RECONCILE_NO_ENTRY", at: ctx.now });
        } else {
          p.state = "CLOSED";
          p.size = 0;
          p.exit_price = null;
          p.exit_reason = null;
          p.closed_at = ctx.now;
        }
        await updateTrade(trade.id, {
          ...simColumns(p),
          reconciliation_kind: "journal_flat_unknown",
          realized_r: null,
          realized_pnl: null,
          broker_status: "reconcile_unknown",
          events,
        });
      } else {
        events.push(...applyExternalExit(p, exitPx, "MANUAL", ctx.now));
        await updateTrade(trade.id, {
          ...simColumns(p),
          reconciliation_kind: "journal_flat",
          realized_r: round(realizedR(p), 3),
          realized_pnl: round(p.cash_flow, 2),
          broker_status: "reconcile_flat",
          events,
        });
      }
      ctx.summary.journal_closed += 1;
      await logEvent({
        kind: RECONCILE_EVENT_KIND,
        symbol: action.symbol,
        severity: action.unknown ? "warn" : "info",
        message: action.unknown
          ? `${action.symbol}: יומן סגור ללא מחיר — לא אושרה כניסה / אין fill`
          : `${action.symbol}: יומן סגור לפי fill בברוקר`,
        data: { action: "journal_flat", trade_id: action.tradeId, unknown: action.unknown, exit_price: exitPx },
      });
      return;
    }
    case "resolve_ambiguous_order": {
      const trade = ctx.trades.get(action.tradeId);
      if (!trade) return;
      const order = await alpaca.getOrderByClientId(action.clientOrderId).catch(() => null);
      if (!order) return;
      await updateTrade(trade.id, {
        broker_entry_order_id: order.id,
        broker_status: order.status,
        broker_filled_qty: Number(order.filled_qty) || null,
      });
      ctx.summary.orders_resolved += 1;
      await logEvent({
        kind: RECONCILE_EVENT_KIND,
        symbol: action.symbol,
        severity: "info",
        message: `${action.symbol}: הזמנת כניסה אותרה לפי client_order_id`,
        data: { action: "resolve_order", trade_id: action.tradeId, order_id: order.id, status: order.status },
      });
    }
  }
}

/**
 * Compare Alpaca paper holdings to open journal trades and heal drift.
 * Idempotent, wrapped in try/catch by callers — must not crash the tick.
 */
export async function runBrokerReconciliation(now = Date.now()): Promise<ReconcileSummary> {
  const summary: ReconcileSummary = { actions: 0, orphans_closed: 0, journal_closed: 0, qty_synced: 0, orders_resolved: 0, errors: [] };
  if (!isAlpacaConfigured()) return summary;
  const settings = await getSettings();
  if (settings.execution_venue !== "ALPACA_PAPER") return summary;

  const [heldRaw, open, closed, universeRows] = await Promise.all([
    alpaca.positions(),
    getOpenTrades(),
    getClosedTrades({ sinceIso: settings.phase_started_at }),
    getUniverse(),
  ]);
  const universe = new Map(universeRows.map((u) => [u.symbol, u]));

  const closedBySymbol = new Map<string, TradeRow>();
  for (const t of closed) {
    if (t.broker !== "ALPACA_PAPER" || t.track !== "AGENT") continue;
    if (!closedBySymbol.has(t.symbol)) closedBySymbol.set(t.symbol, t);
  }
  for (const [symbol, t] of closedBySymbol) if (t.broker_settled_at) closedBySymbol.delete(symbol);

  const held: BrokerHold[] = heldRaw
    .filter((p) => !isDustPosition(p))
    .map((p) => {
      const symbol = fromAlpacaPositionSymbol(p.symbol);
      return {
        symbol,
        assetClass: assetClassForSymbol(symbol, universe),
        qty: Number(p.qty),
        qtyAvailable: Number((p as { qty_available?: string }).qty_available ?? p.qty),
      };
    })
    .filter((p) => p.qty > 0);

  const orphanMatch = matchBrokerOrphans(
    held.map((p) => ({ symbol: p.symbol, qty: p.qty })),
    new Set(open.map((t) => t.symbol)),
    new Map([...closedBySymbol.entries()].map(([s, t]) => [s, { id: t.id }]))
  );
  const reopenSymbols = new Set(orphanMatch.reopenIds.map((id) => closed.find((t) => t.id === id)?.symbol).filter(Boolean) as string[]);

  const plan = planReconciliation({
    held,
    openTrades: journalSnapshots(open),
    reopenTradeIds: orphanMatch.reopenIds,
    reopenSymbols,
  });

  const openCreated = open.map((t) => Date.parse(t.created_at)).filter(Number.isFinite);
  const fillsFrom = openCreated.length ? Math.min(now - 7 * 86_400_000, ...openCreated) : now - 86_400_000;
  const fills = plan.some((a) => a.kind === "close_journal_flat" && !a.unknown) ? await alpaca.fills({ after: fillsFrom, until: now }).catch(() => [] as AlpacaFillActivity[]) : [];

  const trades = new Map(open.map((t) => [t.id, t]));
  summary.actions = plan.length;
  const day = new Date(now).toISOString().slice(0, 10);
  const failLogged = new Set(await symbolsLoggedOn(RECONCILE_FAIL_KIND, day));

  for (const action of plan) {
    try {
      await executeAction(action, { trades, fills, now, summary });
    } catch (err) {
      const detail = err instanceof Error ? err.message.slice(0, 120) : "?";
      const label = action.kind === "resolve_ambiguous_order" ? action.tradeId : action.symbol;
      summary.errors.push(`${action.kind} ${label}: ${detail}`);
      const sym = action.kind === "resolve_ambiguous_order" ? action.symbol : action.symbol;
      if (sym && !failLogged.has(sym)) {
        failLogged.add(sym);
        await logEvent({
          kind: RECONCILE_FAIL_KIND,
          symbol: sym,
          severity: "warn",
          message: `reconciliation failed: ${action.kind} — ${detail}`,
          data: { action, detail },
        }).catch(() => null);
      }
    }
  }
  return summary;
}
