import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mulberry32 } from "../trading/metrics";
import { buildDailyAsset, DEFAULT_DAILY_TREND, runDailyTrend } from "../trading/strategy/daily-trend";
import { AGENT_SKILL_VERSION, TRADING_SKILL } from "../trading/agent-skill";
import { JUDGE_SYSTEM_PROMPT, promptVersionFor } from "../trading/agent-judge";
import type { Bar } from "../trading/types";

function series(seed: number, days = 900, drift = 0.0008): Bar[] {
  const rand = mulberry32(seed);
  const bars: Bar[] = [];
  let p = 100;
  for (let i = 0; i < days; i++) {
    const o = p;
    p = p * (1 + drift + (rand() - 0.5) * 0.04);
    bars.push({ t: i * 86_400_000, o, h: Math.max(o, p) * (1 + rand() * 0.01), l: Math.min(o, p) * (1 - rand() * 0.01), c: p, v: 1e6 * (0.5 + rand()) });
  }
  return bars;
}

describe("daily trend engine", () => {
  const assets = [1, 2, 3, 4].map((k) => buildDailyAsset(`S${k}`, "STOCK", "STOCKS", series(k)));
  const base = { assets, references: {}, params: { ...DEFAULT_DAILY_TREND, require_reference: false }, start: 260 * 86_400_000, end: 899 * 86_400_000, starting_equity: 100_000 };

  it("trades trending synthetic assets and accounts every trade", () => {
    const r = runDailyTrend(base);
    assert.ok(r.stats.trades > 0);
    assert.equal(r.stats.trades, r.trades.length);
    for (const t of r.trades) assert.ok(t.r > -2.5, `loss ${t.r}`);
  });

  it("respects the concurrency parameter and a filter that rejects everything", () => {
    assert.equal(runDailyTrend({ ...base, filter: () => false }).stats.trades, 0);
    const one = runDailyTrend({ ...base, params: { ...base.params, max_concurrent: 1 } });
    for (let i = 0; i < one.trades.length; i++)
      for (let j = i + 1; j < one.trades.length; j++) {
        const a = one.trades[i];
        const b = one.trades[j];
        assert.ok(a.closed_at <= b.opened_at || b.closed_at <= a.opened_at, "positions overlapped with max_concurrent 1");
      }
  });

  it("priority changes which signal gets the slot, not the rules", () => {
    const byName = runDailyTrend({ ...base, params: { ...base.params, max_concurrent: 1 }, priority: (c) => (c.symbol === "S4" ? 1 : 0) });
    assert.equal(byName.stats.trades, byName.trades.length);
  });
});

describe("agent skill", () => {
  it("is versioned and embedded in the live judge prompt", () => {
    assert.ok(JUDGE_SYSTEM_PROMPT.startsWith(TRADING_SKILL));
    assert.ok(promptVersionFor(3).includes(AGENT_SKILL_VERSION));
  });
});
