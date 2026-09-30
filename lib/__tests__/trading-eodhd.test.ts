import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adjustRows, compareReturns, researchSymbols, splitSeries } from "../trading/research/eodhd-core";

const day = (d: string) => Date.parse(`${d}T00:00:00Z`);

describe("EODHD rows → research bars", () => {
  it("adjusts OHLC by adjusted_close / close and drops broken rows", () => {
    const bars = adjustRows([
      { date: "2026-09-21", open: 10, high: 12, low: 9, close: 11, adjusted_close: 5.5, volume: 100 },
      { date: "2026-09-22", open: 0, high: 0, low: 0, close: 0, adjusted_close: 0, volume: 0 },
      { date: "2026-09-23", open: 11, high: 11, low: 11, close: 11, adjusted_close: 11, volume: 0 },
    ]);
    assert.deepEqual(bars, [
      { t: day("2026-09-21"), o: 5, h: 6, l: 4.5, c: 5.5, v: 100 },
      { t: day("2026-09-23"), o: 11, h: 11, l: 11, c: 11, v: 0 },
    ]);
  });
});

describe("symbol universe", () => {
  it("keeps US common stocks on the main exchanges, active and delisted, without ticker collisions", () => {
    const active = [
      { Code: "AAPL", Exchange: "NASDAQ", Type: "Common Stock" },
      { Code: "SPY", Exchange: "NYSE ARCA", Type: "ETF" },
      { Code: "XYZ", Exchange: "NYSE", Type: "Common Stock" },
      { Code: "OTCX", Exchange: "PINK", Type: "Common Stock" },
      { Code: "BRK-B", Exchange: "NYSE", Type: "Common Stock" },
    ];
    const delisted = [
      { Code: "LEH", Exchange: "NYSE", Type: "Common Stock" },
      { Code: "XYZ", Exchange: "NASDAQ", Type: "Common Stock" },
      { Code: "OLDP", Exchange: "NYSE", Type: "Preferred Stock" },
    ];
    const u = researchSymbols(active, delisted);
    assert.deepEqual(u.symbols.map((s) => `${s.code}:${s.delisted ? "D" : "A"}`), ["AAPL:A", "XYZ:A", "BRK-B:A", "LEH:D"]);
    assert.deepEqual(u.collisions, ["XYZ"]);
  });
});

describe("reused tickers and data checks", () => {
  const b = (d: string, c: number) => ({ t: day(d), o: c, h: c, l: c, c, v: 1 });
  it("splits a series at a long gap or an impossible jump", () => {
    const parts = splitSeries([b("2020-01-01", 10), b("2020-01-02", 11), b("2021-06-01", 50), b("2021-06-02", 51), b("2021-06-03", 400)]);
    assert.deepEqual(parts.map((p) => p.length), [2, 2, 1]);
  });
  it("compares daily returns on common dates", () => {
    const a = [b("2020-01-01", 100), b("2020-01-02", 101), b("2020-01-03", 102)];
    const c = [b("2020-01-01", 50), b("2020-01-02", 50.5), b("2020-01-03", 53)];
    const r = compareReturns(a, c);
    assert.equal(r.n, 2);
    assert.ok(r.share_over_1pct > 0.4 && r.share_over_1pct < 0.6);
  });
});
