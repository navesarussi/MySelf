import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOOK_LAST_BARS_SYMBOL_BATCH, detectRebased, planBarSync } from "../trading/book/bars";
import { sizeSignal } from "../trading/book/engine";
import { isEtfName, selectBookCrypto, selectBookStocks } from "../trading/book/universe";
import { buildMultiAsset, cryptoTrend, exitDecision, pullback, runBook } from "../trading/strategy/multi";
import { newPendingPosition } from "../trading/position";
import type { Bar } from "../trading/types";

const D1 = 86_400_000;
const T0 = Date.parse("2025-01-01T00:00:00Z");
const series = (closes: number[], v = 1_000_000): Bar[] => closes.map((c, i) => ({ t: T0 + i * D1, o: c, h: c * 1.01, l: c * 0.99, c, v }));

describe("book universe", () => {
  it("tells ETFs from stocks by issuer name, keeping REIT trusts as stocks", () => {
    assert.equal(isEtfName("iShares Core S&P 500 ETF"), true);
    assert.equal(isEtfName("SPDR Gold Trust"), true);
    assert.equal(isEtfName("Direxion Daily Semiconductor Bull 3x Shares"), true);
    assert.equal(isEtfName("Americold Realty Trust"), false);
    assert.equal(isEtfName("NVIDIA Corporation"), false);
  });

  it("keeps liquid names ≥ $10 and ≥ $20M a day, sorted by liquidity", () => {
    const daily = new Map<string, Bar[]>([
      ["BIG", series(Array(20).fill(100), 1_000_000)], // $100M/day
      ["THIN", series(Array(20).fill(100), 50_000)], // $5M/day
      ["PENNY", series(Array(20).fill(5), 50_000_000)],
      ["IVV", series(Array(20).fill(500), 100_000)], // $50M/day ETF
    ]);
    const rows = selectBookStocks(daily, new Map([["IVV", "iShares Core S&P 500 ETF"]]));
    assert.deepEqual(rows.map((r) => [r.symbol, r.grp]), [["BIG", "STOCKS"], ["IVV", "ETF"]]);
  });

  it("takes only crypto Alpaca can trade with a liquid Binance market", () => {
    const rows = selectBookCrypto(
      [
        { symbol: "BTCUSDT", quoteVolume: 1e9, lastPrice: 60000 },
        { symbol: "ASTERUSDT", quoteVolume: 5e7, lastPrice: 1 },
        { symbol: "DOTUSDT", quoteVolume: 1e6, lastPrice: 4 },
      ],
      new Set(["BTC", "DOT"])
    );
    assert.deepEqual(rows.map((r) => [r.symbol, r.asset_class]), [["BTC", "CRYPTO_MAJOR"]]);
  });
});

describe("daily bar store", () => {
  it("batches book_last_bars by symbol list, not by paginating the full-table result", () => {
    assert.ok(BOOK_LAST_BARS_SYMBOL_BATCH <= 1000);
    assert.equal(Math.ceil(2400 / BOOK_LAST_BARS_SYMBOL_BATCH), 5);
  });

  it("backfills new symbols and appends to stored ones", () => {
    assert.deepEqual(planBarSync(["A", "B"], new Map([["A", { t: "2026-09-25", c: 10 }]])), { backfill: ["B"], incremental: ["A"] });
  });

  it("re-loads a symbol whose re-read closes moved (a split re-based the history)", () => {
    const stored = new Map([["X", new Map([["2025-01-01", 100]])], ["Y", new Map([["2025-01-01", 100]])]]);
    const fresh = new Map([["X", series([50])], ["Y", series([100.2])]]);
    assert.deepEqual(detectRebased(stored, fresh), ["X"]);
  });
});

describe("book sizing", () => {
  const a = buildMultiAsset("S", "STOCK", "STOCKS", series(Array(30).fill(100)));
  it("risks the sleeve's share of equity over the stop distance", () => {
    const s = sizeSignal({ entry: 100, stop: 95, a }, 0.0015, 100_000, null);
    assert.deepEqual(s, { size: 30, riskUsd: 150, notional: 3000 });
  });
  it("caps notional at 20% of equity and at buying power", () => {
    assert.equal(sizeSignal({ entry: 100, stop: 99.9, a }, 0.005, 100_000, null)?.size, 200);
    assert.equal(sizeSignal({ entry: 100, stop: 95, a }, 0.0015, 100_000, 1_000)?.size, 9);
    assert.equal(sizeSignal({ entry: 100, stop: 95, a }, 0.0015, 100_000, 50), null);
  });
});

describe("strategy families", () => {
  it("pullback buys three lower closes inside an uptrend and exits on a close above the 10-day high", () => {
    const up = Array.from({ length: 260 }, (_, i) => 50 + i * 0.3);
    const closes = [...up, up[259] - 1, up[259] - 2, up[259] - 3];
    const a = buildMultiAsset("S", "STOCK", "STOCKS", series(closes));
    const t = a.d1.bars[a.d1.bars.length - 1].t;
    const sigs = pullback().scan([a], t, { references: {} });
    assert.equal(sigs.length, 1);
    assert.equal(sigs[0].fill, "CLOSE");
    const pos = newPendingPosition({ asset_class: "STOCK", entry: 100, stop: 90, size: 1 });
    pos.state = "OPEN";
    pos.entry_price = 100;
    const b = buildMultiAsset("S", "STOCK", "STOCKS", series([...closes, up[259] + 5]));
    assert.equal(exitDecision(pullback(), b, b.d1.bars.length - 1, pos), "SIGNAL");
  });

  it("crypto trend needs BTC above its 100-day average", () => {
    const rising = Array.from({ length: 200 }, (_, i) => 100 + i);
    const falling = Array.from({ length: 200 }, (_, i) => 300 - i);
    const coin = buildMultiAsset("SOL", "CRYPTO_ALT", "CRYPTO", series([...rising.slice(0, 199), 400]));
    const t = coin.d1.bars[199].t;
    const btcUp = buildMultiAsset("BTC", "CRYPTO_MAJOR", "CRYPTO", series(rising));
    const btcDown = buildMultiAsset("BTC", "CRYPTO_MAJOR", "CRYPTO", series(falling));
    assert.equal(cryptoTrend().scan([coin], t, { references: { CRYPTO: btcUp } }).length, 1);
    assert.equal(cryptoTrend().scan([coin], t, { references: { CRYPTO: btcDown } }).length, 0);
  });

  it("the book backtest runs sleeves together without double-booking a symbol", () => {
    const up = Array.from({ length: 400 }, (_, i) => 50 + i * 0.3 + (i % 7 === 0 ? -2 : 0));
    const a = buildMultiAsset("S", "STOCK", "STOCKS", series(up));
    const r = runBook({ assets: [a], references: {}, sleeves: [{ def: pullback(), risk_pct: 0.002, max_positions: 5 }], start: T0, end: T0 + 400 * D1, starting_equity: 100_000 });
    const overlapping = r.trades.some((x, i) => r.trades.some((y, j) => i !== j && x.opened_at < y.closed_at && y.opened_at < x.closed_at));
    assert.equal(overlapping, false);
  });
});
