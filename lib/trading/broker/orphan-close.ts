import { randomUUID } from "crypto";
import { getSupabase } from "@/lib/supabase";
import { alpaca, alpacaSymbol, isDustPosition, type AlpacaFillActivity } from "./alpaca";
import { toBrokerFill } from "./settle";
import { newPendingPosition } from "../position";
import { logEvent, type TradeRow } from "../store";
import { RECONCILIATION_STRATEGY_VERSION } from "../strategy-versions";

export const ORPHAN_CLOSE_PENDING_KIND = "ORPHAN_CLOSE_PENDING";
export const ORPHAN_CLOSE_SETTLED_KIND = "ORPHAN_CLOSE_SETTLED";

export type PendingOrphanClose = {
  symbol: string;
  assetClass: import("../types").AssetClass;
  qty: number;
  at: number;
};

export async function insertOrphanCloseRow(input: {
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

/** Record that a broker orphan close was queued (market closed or sell still working). */
export async function recordPendingOrphanClose(input: PendingOrphanClose) {
  await logEvent({
    kind: ORPHAN_CLOSE_PENDING_KIND,
    symbol: input.symbol,
    severity: "info",
    message: `${input.symbol}: orphan close queued at broker`,
    data: { qty: input.qty, asset_class: input.assetClass, at: input.at },
  });
}

async function pendingOrphans(sinceMs: number): Promise<PendingOrphanClose[]> {
  const { data, error } = await getSupabase()
    .from("trading_events")
    .select("symbol, data, created_at")
    .eq("kind", ORPHAN_CLOSE_PENDING_KIND)
    .gte("created_at", new Date(sinceMs).toISOString())
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  const settled = new Set(
    (
      (
        await getSupabase()
          .from("trading_events")
          .select("symbol")
          .eq("kind", ORPHAN_CLOSE_SETTLED_KIND)
          .gte("created_at", new Date(sinceMs).toISOString())
          .limit(200)
      ).data ?? []
    ).map((r) => String(r.symbol))
  );
  const seen = new Set<string>();
  const out: PendingOrphanClose[] = [];
  for (const row of data ?? []) {
    const symbol = String(row.symbol ?? "");
    if (!symbol || seen.has(symbol) || settled.has(symbol)) continue;
    const d = (row.data ?? {}) as { qty?: number; asset_class?: import("../types").AssetClass; at?: number };
    out.push({
      symbol,
      assetClass: d.asset_class ?? (symbol.length <= 5 ? "STOCK" : "CRYPTO_ALT"),
      qty: Number(d.qty) || 0,
      at: Number(d.at) || Date.parse(String(row.created_at)),
    });
    seen.add(symbol);
  }
  return out;
}

function sellVwap(fills: AlpacaFillActivity[], symbol: string, sinceMs: number): number | null {
  const sells = fills
    .filter((f) => f.symbol === symbol)
    .map(toBrokerFill)
    .filter((f) => f.side === "sell" && f.qty > 0 && f.price > 0 && f.at >= sinceMs)
    .sort((a, b) => b.at - a.at);
  if (!sells.length) return null;
  const qty = sells.reduce((s, f) => s + f.qty, 0);
  const vwap = sells.reduce((s, f) => s + f.qty * f.price, 0) / qty;
  return Number.isFinite(vwap) ? vwap : null;
}

/** Once a queued orphan sell fills, write the orphan_close journal row with the Alpaca fill price. */
export async function settlePendingOrphanCloses(now: number): Promise<number> {
  const since = now - 7 * 86_400_000;
  const pending = await pendingOrphans(since);
  if (!pending.length) return 0;
  const fills = await alpaca.fills({ after: since, until: now }).catch(() => [] as AlpacaFillActivity[]);
  let settled = 0;
  for (const p of pending) {
    const held = await alpaca.position(p.symbol, p.assetClass).catch(() => null);
    if (!isDustPosition(held)) continue;
    const sym = alpacaSymbol(p.symbol, p.assetClass);
    const exitPrice = sellVwap(fills, sym, p.at) ?? sellVwap(fills, p.symbol, p.at);
    const qty = p.qty || 1;
    const rowId = await insertOrphanCloseRow({ symbol: p.symbol, assetClass: p.assetClass, qty, exitPrice, now });
    await logEvent({
      kind: ORPHAN_CLOSE_SETTLED_KIND,
      symbol: p.symbol,
      severity: "info",
      message: `${p.symbol}: orphan close settled from broker fill`,
      data: { trade_id: rowId, exit_price: exitPrice, qty },
    });
    settled += 1;
  }
  return settled;
}

/** Backfill orphan_close rows for symbols that already flattened today without a journal row. */
export async function backfillOrphanCloses(input: { symbols: string[]; sinceMs: number; now: number; openTrades: TradeRow[] }): Promise<number> {
  const openSymbols = new Set(input.openTrades.map((t) => t.symbol));
  const fills = await alpaca.fills({ after: input.sinceMs, until: input.now }).catch(() => [] as AlpacaFillActivity[]);
  let n = 0;
  for (const symbol of input.symbols) {
    if (openSymbols.has(symbol)) continue;
    const { data } = await getSupabase()
      .from("trading_trades")
      .select("id")
      .eq("symbol", symbol)
      .eq("reconciliation_kind", "orphan_close")
      .gte("created_at", new Date(input.sinceMs).toISOString())
      .limit(1);
    if (data?.length) continue;
    const held = await alpaca.position(symbol, "STOCK").catch(() => null);
    if (!isDustPosition(held)) continue;
    const exitPrice = sellVwap(fills, symbol, input.sinceMs);
    if (exitPrice === null) continue;
    const rowId = await insertOrphanCloseRow({ symbol, assetClass: "STOCK", qty: 1, exitPrice, now: input.now });
    await logEvent({
      kind: ORPHAN_CLOSE_SETTLED_KIND,
      symbol,
      severity: "info",
      message: `${symbol}: orphan close backfilled from today's fill`,
      data: { trade_id: rowId, exit_price: exitPrice },
    });
    n += 1;
  }
  return n;
}
