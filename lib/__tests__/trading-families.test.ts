import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inCloseWindow, withProvisionalBar } from "../trading/book/close-sleeve";
import { bookStockGross } from "../trading/book/engine";
import { newPendingPosition } from "../trading/position";
import {
  assetRotation,
  buildMultiAsset,
  crossRanker,
  firstBarOfMonth,
  ibsClose,
  momentum,
  reversal,
  type MultiAsset,
} from "../trading/strategy/multi";
import type { Bar } from "../trading/types";

const D1 = 86_400_000;
const T0 = Date.parse("2024-01-01T00:00:00Z");
/** Daily bars (weekends included — the strategies only look at bar order) with a steady $100M/day. */
const bars = (closes: number[]): Bar[] => closes.map((c, i) => ({ t: T0 + i * D1, o: c, h: c * 1.01, l: c * 0.99, c, v: 1e8 / c }));
const trend = (n: number, from: number, dailyPct: number) => Array.from({ length: n }, (_, i) => from * (1 + dailyPct) ** i);
const stock = (s: string, closes: number[]) => buildMultiAsset(s, "STOCK", "STOCKS", bars(closes));
const etf = (s: string, closes: number[]) => buildMultiAsset(s, "STOCK", "ETF", bars(closes));
const lastT = (a: MultiAsset) => a.d1.bars[a.d1.bars.length - 1].t;

describe("cross-sectional ranks", () => {
  it("orders by value (0 = best) with percentiles, skipping ineligible assets", () => {
    const xs = ["A", "B", "C"].map((s, k) => stock(s, trend(300, 50, 0.001 * (k + 1))));
    const r = crossRanker((a, i) => (a.symbol === "B" ? null : a.mom12[i]));
    const t = lastT(xs[0]);
    r.prepare(xs, t);
    assert.equal(r.ord("C", t), 0);
    assert.equal(r.ord("A", t), 1);
    assert.equal(r.ord("B", t), null);
    assert.equal(r.pct("C", t), 1);
    assert.equal(r.pct("A", t), 0);
  });

  it("finds the first session of a month", () => {
    const a = stock("A", trend(40, 50, 0));
    const i = a.d1.bars.findIndex((b) => new Date(b.t).getUTCDate() === 1 && new Date(b.t).getUTCMonth() === 1);
    assert.equal(firstBarOfMonth(a, i), true);
    assert.equal(firstBarOfMonth(a, i + 1), false);
  });
});

describe("momentum sleeve", () => {
  // 30 stocks with different drifts; the monthly scan buys the top N by 12-1 momentum.
  const xs = Array.from({ length: 30 }, (_, k) => stock(`S${k}`, trend(320, 40, 0.0002 * k)));
  const firstOfMonth = xs[0].d1.bars.findIndex((b, i) => i > 300 && new Date(b.t).getUTCDate() === 1);

  it("buys only the top N on the first session of the month", () => {
    const def = momentum({ top: 5, keep: 10, stop_atr: 5 });
    const t = xs[0].d1.bars[firstOfMonth].t;
    const sigs = def.scan(xs, t, { references: {} });
    assert.deepEqual(sigs.map((s) => s.a.symbol).sort(), ["S25", "S26", "S27", "S28", "S29"]);
    assert.ok(sigs.every((s) => s.stop < s.entry));
    assert.deepEqual(def.scan(xs, t + D1, { references: {} }), []);
  });

  it("exits a holding that falls out of the top `keep` at the monthly check only", () => {
    const def = momentum({ top: 5, keep: 10, stop_atr: 5 });
    const t = xs[0].d1.bars[firstOfMonth].t;
    def.prepare!(xs, t);
    const pos = newPendingPosition({ asset_class: "STOCK", entry: 1, stop: 0.5, size: 1 });
    assert.equal(def.exit!(xs[29], firstOfMonth, pos), null); // rank 0
    assert.equal(def.exit!(xs[21], firstOfMonth, pos), null); // rank 8 < keep
    assert.equal(def.exit!(xs[3], firstOfMonth, pos), "SIGNAL"); // rank 26
    def.prepare!(xs, t + D1);
    assert.equal(def.exit!(xs[3], firstOfMonth + 1, pos), null); // not a rebalance bar
  });
});

describe("reversal sleeve", () => {
  const spy = etf("SPY", trend(320, 400, 0.0005));
  const refs = { references: { STOCKS: spy } };

  it("buys a ≥10% 5-day drop in an uptrending momentum leader", () => {
    const peers = Array.from({ length: 9 }, (_, k) => stock(`P${k}`, trend(320, 40, 0.0001 * k)));
    const closes = trend(315, 20, 0.004); // the strongest trend of the group
    const top = closes[closes.length - 1];
    closes.push(top * 0.97, top * 0.94, top * 0.91, top * 0.89, top * 0.87);
    const leader = stock("LEAD", closes);
    const sigs = reversal().scan([...peers, leader], lastT(leader), refs);
    assert.deepEqual(sigs.map((s) => s.a.symbol), ["LEAD"]);
    const s = sigs[0];
    assert.equal(s.fill, "CLOSE");
    assert.ok(s.entry - s.stop > 3 * leader.d1.atr[s.i]); // wide catastrophe stop
  });

  it("skips the drop when the market regime is down", () => {
    const down = etf("SPY", trend(320, 400, -0.001));
    const closes = trend(315, 20, 0.004);
    const top = closes[closes.length - 1];
    closes.push(top * 0.97, top * 0.94, top * 0.91, top * 0.89, top * 0.87);
    const leader = stock("LEAD", closes);
    assert.deepEqual(reversal().scan([leader], lastT(leader), { references: { STOCKS: down } }), []);
  });

  it("exits on the first close above the 5-day average", () => {
    const closes = [...trend(300, 20, 0.004)];
    const top = closes[closes.length - 1];
    closes.push(top * 0.9, top * 0.88, top * 0.97);
    const a = stock("X", closes);
    const pos = newPendingPosition({ asset_class: "STOCK", entry: 1, stop: 0.5, size: 1 });
    assert.equal(reversal().exit!(a, closes.length - 2, pos), null);
    assert.equal(reversal().exit!(a, closes.length - 1, pos), "SIGNAL");
  });
});

describe("asset rotation sleeve", () => {
  it("rotates only listed cross-asset ETFs that are in an uptrend with positive momentum", () => {
    const up = (s: string, d: number) => etf(s, trend(320, 100, d));
    const xs = [up("SPY", 0.001), up("TLT", 0.0005), up("GLD", 0.0008), up("DBC", -0.0005), up("ARKK", 0.003)];
    const def = assetRotation({ top: 5, keep: 7, stop_atr: 5 });
    const i = xs[0].d1.bars.findIndex((b, k) => k > 300 && new Date(b.t).getUTCDate() === 1);
    const sigs = def.scan(xs, xs[0].d1.bars[i].t, { references: {} });
    assert.deepEqual(sigs.map((s) => s.a.symbol).sort(), ["GLD", "SPY", "TLT"]); // DBC falling, ARKK not in the list
  });
});

describe("book gross", () => {
  it("sums stock notional of open and queued trades, ignoring crypto", () => {
    const rows = [
      { asset_class: "STOCK" as const, setup: "MOMENTUM", entry_limit: 100, entry_price: 101, remaining_size: 10, position_size: 10 },
      { asset_class: "STOCK" as const, setup: "REVERSAL", entry_limit: 50, entry_price: null, remaining_size: 0, position_size: 20 }, // queued
      { asset_class: "STOCK" as const, setup: "IBS_CLOSE", entry_limit: 400, entry_price: 400, remaining_size: 30, position_size: 30 }, // own cap
      { asset_class: "CRYPTO_MAJOR" as const, setup: "CRYPTO_TREND", entry_limit: 60000, entry_price: 60000, remaining_size: 1, position_size: 1 },
    ];
    assert.equal(bookStockGross(rows), 1010 + 1000);
  });
});

describe("IBS close sleeve", () => {
  it("buys equity ETFs closing in the bottom tenth of the day's range, lowest first", () => {
    const mk = (s: string, lastClose: number) => {
      const b = bars(trend(40, 100, 0));
      b[b.length - 1] = { ...b[b.length - 1], h: 102, l: 98, c: lastClose };
      return buildMultiAsset(s, "STOCK", "ETF", b);
    };
    const xs = [mk("SPY", 98.1), mk("QQQ", 98.3), mk("XLE", 99), mk("ARKK", 98.05)];
    const sigs = ibsClose().scan(xs, lastT(xs[0]), { references: {} });
    assert.deepEqual(sigs.map((s) => s.a.symbol), ["SPY", "QQQ"]); // XLE IBS 0.25; ARKK not in the list
    assert.ok(sigs[0].stop < sigs[0].entry);
  });

  it("acts only between 21 and 11 minutes before the close", () => {
    const close = Date.parse("2026-09-28T20:00:00Z");
    assert.equal(inCloseWindow(close - 25 * 60_000, close), false);
    assert.equal(inCloseWindow(close - 15 * 60_000, close), true);
    assert.equal(inCloseWindow(close - 10 * 60_000, close), false);
  });

  it("replaces a stored bar for today with the live session", () => {
    const hist = bars([100, 101, 102]);
    const day = hist[2].t;
    const out = withProvisionalBar(hist, { o: 102, h: 103, l: 99, c: 99.2, v: 5, price: 99.2, at: day }, day);
    assert.equal(out.length, 3);
    assert.equal(out[2].c, 99.2);
  });
});
