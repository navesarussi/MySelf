import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_SYMBOLS, applyFetched, createTailCache, mergeTail, planRefresh } from "../trading/intraday-bar-cache";
import { collectBarsPage, isRegularSessionBar, regularSessionWindow } from "../trading/broker/alpaca-data";
import { regularClosedBar } from "../trading/intraday-data";
import type { Bar } from "../trading/types";

const M5 = 5 * 60_000;
const bar = (t: number, c = 1): Bar => ({ t, o: c, h: c, l: c, c, v: 1 });
const series = (from: number, n: number, ms = M5, c = 1) => Array.from({ length: n }, (_, i) => bar(from + i * ms, c));

describe("mergeTail", () => {
  it("appends fresh bars and keeps the newest `tail`", () => {
    const merged = mergeTail(series(0, 5), series(5 * M5, 3), 6);
    assert.deepEqual(merged.map((b) => b.t / M5), [2, 3, 4, 5, 6, 7]);
  });

  it("lets a re-fetched bar replace its cached copy", () => {
    const merged = mergeTail(series(0, 5, M5, 1), series(3 * M5, 3, M5, 2), 100);
    assert.deepEqual(merged.map((b) => [b.t / M5, b.c]), [[0, 1], [1, 1], [2, 1], [3, 2], [4, 2], [5, 2]]);
  });

  it("keeps the cache when nothing new arrived", () => {
    assert.equal(mergeTail(series(0, 4), [], 3).length, 3);
  });

  it("does not mutate the cached array", () => {
    const cached = series(0, 4);
    mergeTail(cached, series(2 * M5, 4), 100);
    assert.equal(cached.length, 4);
  });
});

describe("planRefresh", () => {
  const day = "2026-09-25";
  const fullStart = 1_000 * M5;

  it("loads everything cold on an empty cache", () => {
    const plan = planRefresh(createTailCache(10), ["A", "B"], day, fullStart, 3 * M5);
    assert.deepEqual(plan, { cold: ["A", "B"], warm: [], warmStart: fullStart });
  });

  it("fetches cached symbols from their oldest last bar minus the overlap", () => {
    const cache = createTailCache(10);
    cache.day = day;
    cache.series.set("A", series(1_500 * M5, 5)); // last bar 1504
    cache.series.set("B", series(1_502 * M5, 5)); // last bar 1506
    const plan = planRefresh(cache, ["A", "B", "C"], day, fullStart, 3 * M5);
    assert.deepEqual(plan.cold, ["C"]);
    assert.deepEqual(plan.warm, ["A", "B"]);
    assert.equal(plan.warmStart, 1_501 * M5);
  });

  it("reloads a symbol cold when its cache has fallen out of the window or is empty", () => {
    const cache = createTailCache(10);
    cache.day = day;
    cache.series.set("OLD", series(900 * M5, 5));
    cache.series.set("EMPTY", []);
    assert.deepEqual(planRefresh(cache, ["OLD", "EMPTY"], day, fullStart, 3 * M5).cold, ["OLD", "EMPTY"]);
  });

  it("starts over on a new day (split adjustments) and past MAX_SYMBOLS", () => {
    const cache = createTailCache(10);
    cache.day = "2026-09-24";
    cache.series.set("A", series(1_500 * M5, 5));
    assert.deepEqual(planRefresh(cache, ["A"], day, fullStart, 0).cold, ["A"]);
    assert.equal(cache.day, day);
    assert.equal(cache.series.size, 0);

    for (let i = 0; i < MAX_SYMBOLS; i++) cache.series.set(`S${i}`, series(1_500 * M5, 1));
    planRefresh(cache, ["A"], day, fullStart, 0);
    assert.equal(cache.series.size, 0);
  });
});

describe("applyFetched", () => {
  it("replaces on a cold load and extends on a warm one, bounded by tail", () => {
    const cache = createTailCache(4);
    cache.series.set("A", series(0, 3, M5, 9));
    applyFetched(cache, new Map([["A", series(10 * M5, 3)]]), ["A"], true);
    assert.deepEqual(cache.series.get("A")!.map((b) => b.t / M5), [10, 11, 12]);
    applyFetched(cache, new Map([["A", series(12 * M5, 3)]]), ["A"], false);
    assert.deepEqual(cache.series.get("A")!.map((b) => b.t / M5), [11, 12, 13, 14]);
  });

  it("stores an empty series for a cold symbol the provider returned nothing for", () => {
    const cache = createTailCache(4);
    applyFetched(cache, new Map(), ["NEW"], true);
    assert.deepEqual(cache.series.get("NEW"), []);
  });

  it("drops a warm merge whose entry was reset in between, so it reloads cold", () => {
    const cache = createTailCache(4);
    applyFetched(cache, new Map([["A", series(0, 2)]]), ["A"], false);
    assert.equal(cache.series.has("A"), false);
  });
});

/** The per-bar implementation this replaced — kept as the reference the cached window must match. */
function referenceIsRegularSessionBar(t: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date(t));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const mins = hour * 60 + minute;
  return wd !== "Sat" && wd !== "Sun" && mins >= 570 && mins < 960;
}

describe("isRegularSessionBar", () => {
  it("matches the per-bar Intl implementation every 5 minutes across both DST switches", () => {
    const windows = [
      [Date.UTC(2026, 2, 2), Date.UTC(2026, 2, 16)], // EST → EDT on 8 March
      [Date.UTC(2026, 9, 26), Date.UTC(2026, 10, 9)], // EDT → EST on 1 November
    ];
    let checked = 0;
    for (const [from, to] of windows) {
      for (let t = from; t < to; t += M5) {
        assert.equal(isRegularSessionBar(t), referenceIsRegularSessionBar(t), new Date(t).toISOString());
        checked++;
      }
    }
    assert.ok(checked > 8000);
  });

  it("opens at 13:30 UTC in summer and 14:30 UTC in winter; closed on weekends", () => {
    assert.deepEqual(regularSessionWindow(Date.UTC(2026, 8, 24, 3)), [Date.UTC(2026, 8, 24, 13, 30), Date.UTC(2026, 8, 24, 20)]);
    assert.deepEqual(regularSessionWindow(Date.UTC(2026, 0, 15, 23)), [Date.UTC(2026, 0, 15, 14, 30), Date.UTC(2026, 0, 15, 21)]);
    assert.equal(regularSessionWindow(Date.UTC(2026, 8, 26, 15)), null); // Saturday
    assert.equal(isRegularSessionBar(Date.UTC(2026, 8, 24, 19, 55)), true);
    assert.equal(isRegularSessionBar(Date.UTC(2026, 8, 24, 20)), false);
  });
});

describe("stock bar parsing", () => {
  const raw = (iso: string) => ({ t: iso, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });

  it("drops rejected bars at parse time and appends pages per symbol", () => {
    const out = new Map<string, Bar[]>();
    const keep = (t: number) => isRegularSessionBar(t);
    collectBarsPage(out, { AAPL: [raw("2026-09-24T12:00:00Z"), raw("2026-09-24T13:30:00Z")] }, keep);
    collectBarsPage(out, { AAPL: [raw("2026-09-24T13:45:00Z")], MSFT: [raw("2026-09-24T21:00:00Z")] }, keep);
    collectBarsPage(out, null, keep);
    assert.deepEqual(out.get("AAPL")!.map((b) => new Date(b.t).toISOString()), ["2026-09-24T13:30:00.000Z", "2026-09-24T13:45:00.000Z"]);
    assert.deepEqual(out.get("MSFT"), []);
  });

  it("keeps only closed regular-session bars", () => {
    const now = Date.UTC(2026, 8, 24, 14, 1);
    const keep = regularClosedBar(M5, now);
    assert.equal(keep(Date.UTC(2026, 8, 24, 13, 55)), true); // closed 14:00
    assert.equal(keep(Date.UTC(2026, 8, 24, 14, 0)), false); // still forming
    assert.equal(keep(Date.UTC(2026, 8, 24, 13, 25)), false); // pre-market
  });
});
