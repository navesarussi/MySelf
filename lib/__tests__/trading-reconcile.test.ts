import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  entryConfirmedAtBroker,
  isEntryOrderOpen,
  planReconciliation,
  qtyMismatch,
  reconcileEventKey,
  reconcileEventsToEmit,
} from "../trading/broker/reconcile-decisions";
import { clampSellQty, positionSellableQty } from "../trading/broker/alpaca";

describe("reconciliation decisions", () => {
  it("detects entry confirmed from fill or open state", () => {
    assert.equal(entryConfirmedAtBroker({ entry_price: 10, broker_filled_qty: null, sim_state: { opened_at: null, state: "PENDING" } }), true);
    assert.equal(entryConfirmedAtBroker({ entry_price: null, broker_filled_qty: 5, sim_state: { opened_at: null, state: "PENDING" } }), true);
    assert.equal(entryConfirmedAtBroker({ entry_price: null, broker_filled_qty: null, sim_state: { opened_at: 1, state: "OPEN" } }), true);
    assert.equal(entryConfirmedAtBroker({ entry_price: null, broker_filled_qty: null, sim_state: { opened_at: null, state: "PENDING" } }), false);
  });

  it("plans orphan close for broker-only positions", () => {
    const plan = planReconciliation({
      held: [{ symbol: "SPY", assetClass: "STOCK", qty: 10, qtyAvailable: 10 }],
      openTrades: [],
      reopenTradeIds: [],
      reopenSymbols: new Set(),
    });
    assert.deepEqual(plan, [{ kind: "close_orphan", symbol: "SPY", assetClass: "STOCK", qty: 10 }]);
  });

  it("skips orphan close when resurrect will reopen the symbol", () => {
    const plan = planReconciliation({
      held: [{ symbol: "AVAX", assetClass: "CRYPTO_ALT", qty: 100, qtyAvailable: 100 }],
      openTrades: [],
      reopenTradeIds: ["t1"],
      reopenSymbols: new Set(["AVAX"]),
    });
    assert.deepEqual(plan, []);
  });

  it("plans journal flat close when broker is flat but entry was confirmed", () => {
    const plan = planReconciliation({
      held: [],
      openTrades: [
        {
          id: "t1",
          symbol: "DOT",
          assetClass: "CRYPTO_ALT",
          qty: 100,
          state: "OPEN",
          entryConfirmed: true,
          brokerEntryOrderId: "ord-1",
          clientOrderId: "t1-in",
          brokerStatus: "filled",
        },
      ],
      reopenTradeIds: [],
      reopenSymbols: new Set(),
    });
    assert.equal(plan.length, 1);
    assert.equal(plan[0].kind, "close_journal_flat");
    assert.equal((plan[0] as { unknown: boolean }).unknown, false);
  });

  it("marks journal flat unknown when entry was never confirmed", () => {
    const plan = planReconciliation({
      held: [],
      openTrades: [
        {
          id: "t2",
          symbol: "LDO",
          assetClass: "CRYPTO_ALT",
          qty: 50,
          state: "OPEN",
          entryConfirmed: false,
          brokerEntryOrderId: null,
          clientOrderId: "t2-in",
          brokerStatus: null,
        },
      ],
      reopenTradeIds: [],
      reopenSymbols: new Set(),
    });
    const flat = plan.find((a) => a.kind === "close_journal_flat");
    assert.ok(flat);
    assert.equal((flat as { unknown: boolean }).unknown, true);
  });

  it("plans qty sync when broker and journal diverge", () => {
    const plan = planReconciliation({
      held: [{ symbol: "PEPE", assetClass: "CRYPTO_ALT", qty: 1_000_000, qtyAvailable: 999_500 }],
      openTrades: [
        {
          id: "t3",
          symbol: "PEPE",
          assetClass: "CRYPTO_ALT",
          qty: 1_010_000,
          state: "OPEN",
          entryConfirmed: true,
          brokerEntryOrderId: "o1",
          clientOrderId: "t3-in",
          brokerStatus: "filled",
        },
      ],
      reopenTradeIds: [],
      reopenSymbols: new Set(),
    });
    assert.deepEqual(plan.filter((a) => a.kind === "sync_qty"), [
      { kind: "sync_qty", tradeId: "t3", symbol: "PEPE", brokerQty: 1_000_000, journalQty: 1_010_000 },
    ]);
  });

  it("plans ambiguous order lookup for pending rows without broker order id", () => {
    const plan = planReconciliation({
      held: [],
      openTrades: [
        {
          id: "abc",
          symbol: "UNI",
          assetClass: "CRYPTO_ALT",
          qty: 0,
          state: "PENDING",
          entryConfirmed: false,
          brokerEntryOrderId: null,
          clientOrderId: "abc-in",
          brokerStatus: null,
        },
      ],
      reopenTradeIds: [],
      reopenSymbols: new Set(),
    });
    assert.deepEqual(plan, [{ kind: "resolve_ambiguous_order", tradeId: "abc", symbol: "UNI", clientOrderId: "abc-in" }]);
  });

  it("dedupes reconciliation event keys per day", () => {
    const a = { kind: "close_orphan" as const, symbol: "SPY", assetClass: "STOCK" as const, qty: 1 };
    assert.equal(reconcileEventKey(a), "orphan:SPY");
    assert.deepEqual(reconcileEventsToEmit([a, a], ["orphan:SPY"]), []);
    assert.deepEqual(reconcileEventsToEmit([a, a], []), [a]);
  });

  it("qty mismatch tolerates crypto fee gap but not large drift", () => {
    assert.equal(qtyMismatch(1000, 999.5, "CRYPTO_ALT"), false);
    assert.equal(qtyMismatch(1000, 990, "CRYPTO_ALT"), true);
    assert.equal(qtyMismatch(10, 9, "STOCK"), true);
    assert.equal(qtyMismatch(10, 10, "STOCK"), false);
  });

  it("skips qty sync while the entry order is still working or partially filled", () => {
    const plan = planReconciliation({
      held: [{ symbol: "ELVN", assetClass: "STOCK", qty: 14, qtyAvailable: 14 }],
      openTrades: [
        {
          id: "t4",
          symbol: "ELVN",
          assetClass: "STOCK",
          qty: 26,
          state: "OPEN",
          entryConfirmed: false,
          brokerEntryOrderId: "o2",
          clientOrderId: "t4-in",
          brokerStatus: "partially_filled",
        },
      ],
      reopenTradeIds: [],
      reopenSymbols: new Set(),
    });
    assert.deepEqual(plan.filter((a) => a.kind === "sync_qty"), []);
  });

  it("plans orphan close for accidental short positions", () => {
    const plan = planReconciliation({
      held: [{ symbol: "SPY", assetClass: "STOCK", qty: -2, qtyAvailable: -2 }],
      openTrades: [],
      reopenTradeIds: [],
      reopenSymbols: new Set(),
    });
    assert.deepEqual(plan, [{ kind: "close_orphan", symbol: "SPY", assetClass: "STOCK", qty: 2 }]);
  });

  it("detects working entry orders", () => {
    assert.equal(isEntryOrderOpen("partially_filled"), true);
    assert.equal(isEntryOrderOpen("filled"), false);
    assert.equal(isEntryOrderOpen(null), false);
  });
});

describe("sellable qty uses qty_available", () => {
  it("never rounds up past available balance", () => {
    assert.equal(clampSellQty(100, 99.999999, "CRYPTO_ALT"), 99.999999);
    assert.equal(
      positionSellableQty({ symbol: "DOTUSD", qty: "100", qty_available: "99.5", avg_entry_price: "1", current_price: "1", unrealized_pl: "0" }, 100, "CRYPTO_ALT"),
      99.5
    );
  });
});
