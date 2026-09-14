/**
 * AI backtest: does the trading agent's SKILL add value over the deterministic signal?
 *   npx tsx scripts/trading/agent-backtest.ts <daily-cache-dir> [--from 2022-01-01] [--to 2024-06-30] [--label skill]
 * Every signal is shown to the model ANONYMIZED (no symbol, no dates, prices rebased to 100) so it cannot
 * recall what happened next. Decisions are cached, then replayed through the same portfolio engine.
 */
import fs from "node:fs";
import path from "node:path";
import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { AGENT_MODEL_ID } from "../../lib/trading/config";
import { AGENT_SKILL_VERSION, TRADING_SKILL } from "../../lib/trading/agent-skill";
import { buildDailyAsset, DEFAULT_DAILY_TREND, runDailyTrend, type DailyAsset, type DailyResult } from "../../lib/trading/strategy/daily-trend";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DIR = process.argv[2];
if (!DIR) throw new Error("usage: agent-backtest.ts <daily-cache-dir>");
const envFile = path.join(process.cwd(), ".env.local");
if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && fs.existsSync(envFile)) {
  const m = fs.readFileSync(envFile, "utf8").match(/^GOOGLE_GENERATIVE_AI_API_KEY=(.*)$/m);
  if (m) process.env.GOOGLE_GENERATIVE_AI_API_KEY = m[1].replace(/^"|"$/g, "");
}
const FROM = Date.parse(arg("from") ?? "2022-01-01");
const TO = Date.parse(arg("to") ?? "2024-06-30");
const LABEL = arg("label") ?? AGENT_SKILL_VERSION;
const CACHE = path.join(DIR, "..", `agent-decisions-${LABEL}-${arg("from") ?? "2022-01-01"}.json`);
const ETFS = new Set(["GLD", "SLV", "TLT", "IEF", "XLE", "XLF", "XLK", "XLV", "XLI", "XLY", "XLP", "XLU", "EEM", "EFA", "USO", "DBC", "SMH", "ARKK", "VNQ", "HYG", "DIA"]);

const assets: DailyAsset[] = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).map((f) => {
  const { sym, bars } = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  return buildDailyAsset(sym.symbol, sym.asset_class, sym.asset_class !== "STOCK" ? "CRYPTO" : ETFS.has(sym.symbol) ? "ETF" : "STOCKS", bars);
});
const references = { CRYPTO: assets.find((a) => a.symbol === "BTC"), STOCKS: assets.find((a) => a.symbol === "SPY"), ETF: undefined };
const params = { ...DEFAULT_DAILY_TREND, breakout_days: 100, exit_days: 20, trail_atr: 3, stop_atr: 3, rs_min: 0, max_concurrent: 5, version: "daily-trend-b100-t3-s3-c5" };
const run = (filter?: Parameters<typeof runDailyTrend>[0]["filter"], priority?: Parameters<typeof runDailyTrend>[0]["priority"]) =>
  runDailyTrend({ assets, references, params, start: FROM, end: TO, starting_equity: 100_000, filter, priority });

type Signal = { key: string; symbol: string; group: string; t: number; rs: number | null; room_r: number | null; features: Record<string, number | null> };
const signals: Signal[] = [];
runDailyTrend({ assets, references, params: { ...params, max_concurrent: 999 }, start: FROM, end: TO, starting_equity: 1e12, filter: (c) => {
  signals.push({ key: `${c.symbol}|${c.t}`, symbol: c.symbol, group: c.group, t: c.t, rs: c.rs, room_r: c.room, features: c.features as unknown as Record<string, number | null> });
  return false;
} });

const r2 = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const schema = z.object({ decision: z.enum(["ENTER", "SKIP"]), risk_multiplier: z.number(), reasoning: z.string().max(500) });
type Decision = { decision: "ENTER" | "SKIP"; mult: number; reasoning: string };
const decisions: Record<string, Decision> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

async function judge(s: Signal) {
  const a = assets.find((x) => x.symbol === s.symbol)!;
  const i = a.idx.get(s.t)!;
  const base = a.d1.bars[i - 60].c;
  const vs = a.d1.volSma[i] || 1;
  const data = {
    asset_type: s.group === "CRYPTO" ? "crypto" : s.group === "ETF" ? "etf" : "single stock",
    signal: "close at a new 100-day high, above SMA200; stop = 3×ATR; exit = 3×ATR chandelier trail",
    features: Object.fromEntries(Object.entries(s.features).map(([k, v]) => [k, r2(v)])),
    relative_strength_rank_in_group: r2(s.rs),
    room_to_resistance_r: r2(s.room_r),
    last_60_days_ohlc_rebased_100_volume_ratio: a.d1.bars.slice(i - 59, i + 1).map((b) => [r2((b.o / base) * 100), r2((b.h / base) * 100), r2((b.l / base) * 100), r2((b.c / base) * 100), r2(b.v / vs)]),
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await generateText({
        model: google(AGENT_MODEL_ID),
        system: `${TRADING_SKILL}\n\nהחזר decision, risk_multiplier (1 / 0.75 / 0.5; SKIP = 0) ונימוק קצר בעברית. אין לך שם נכס או תאריך — שפוט רק לפי הנתונים.`,
        prompt: `<data>${JSON.stringify(data)}</data>`,
        output: Output.object({ schema }),
        temperature: 0.2,
      });
      const o = schema.parse(res.output);
      const mult = o.decision === "SKIP" ? 0 : o.risk_multiplier >= 1 ? 1 : o.risk_multiplier >= 0.75 ? 0.75 : o.risk_multiplier >= 0.5 ? 0.5 : 0;
      decisions[s.key] = { decision: mult === 0 ? "SKIP" : "ENTER", mult, reasoning: o.reasoning };
      return;
    } catch (err) {
      if (attempt === 2) console.error("judge failed", s.key, err instanceof Error ? err.message.slice(0, 100) : err);
    }
  }
}

async function main() {
  const todo = signals.filter((s) => !decisions[s.key]);
  console.log(`${signals.length} signals (${todo.length} to judge) · model ${AGENT_MODEL_ID} · ${LABEL}`);
  let done = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (todo.length) {
        await judge(todo.shift()!);
        if (++done % 25 === 0) {
          fs.writeFileSync(CACHE, JSON.stringify(decisions));
          console.log(`judged ${done}`);
        }
      }
    })
  );
  fs.writeFileSync(CACHE, JSON.stringify(decisions));

  const fmt = (name: string, r: DailyResult) =>
    `${name.padEnd(22)} n=${String(r.stats.trades).padStart(3)} win=${(r.stats.win_rate * 100).toFixed(0)}% exp=${r.stats.expectancy_r.toFixed(2)}R CAGR=${(r.cagr * 100).toFixed(1)}% Sharpe=${r.sharpe} DD=${(r.max_dd * 100).toFixed(1)}%`;
  const agentFilter = (c: { symbol: string; t: number }) => decisions[`${c.symbol}|${c.t}`]?.decision !== "SKIP";
  console.log(fmt("deterministic only", run()));
  console.log(fmt("agent skill filter", run(agentFilter)));
  // Agent as RANKER: never vetoes, only decides what gets the scarce slots (ENTER×1 > ×0.75 > ×0.5 > SKIP).
  const agentRank = (c: { symbol: string; t: number }) => {
    const d = decisions[`${c.symbol}|${c.t}`];
    return d ? (d.decision === "SKIP" ? 0 : d.mult) : 0.5;
  };
  console.log(fmt("agent skill ranker", run(undefined, agentRank)));
  // Agent vetoes only its strongest "no" on a symbol's FIRST signal day; later repeats of a skipped breakout are ignored too.
  console.log(fmt("ranker + veto repeats", run((c) => !(decisions[`${c.symbol}|${c.t}`]?.decision === "SKIP" && decisions[`${c.symbol}|${c.t - 86_400_000}`]?.decision === "SKIP"), agentRank)));
  // Signal-level quality: mean R of the signals the agent took vs skipped (uncapped, no portfolio effects).
  const outcome = runDailyTrend({ assets, references, params: { ...params, max_concurrent: 999 }, start: FROM, end: TO, starting_equity: 1e12 });
  const rByKey = new Map(outcome.trades.map((t) => [`${t.symbol}|${t.opened_at}`, t.r]));
  const pairs = signals.map((s) => {
    const trade = outcome.trades.find((t) => t.symbol === s.symbol && t.opened_at > s.t && t.opened_at <= s.t + 5 * 86_400_000);
    return { d: decisions[s.key], r: trade?.r ?? null };
  }).filter((x) => x.d && x.r !== null) as { d: Decision; r: number }[];
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const taken = pairs.filter((p) => p.d.decision === "ENTER").map((p) => p.r * p.d.mult);
  const skipped = pairs.filter((p) => p.d.decision === "SKIP").map((p) => p.r);
  console.log(`signals with outcome ${pairs.length}: agent took ${taken.length} (mean ${mean(pairs.filter((p) => p.d.decision === "ENTER").map((p) => p.r)).toFixed(2)}R) · skipped ${skipped.length} (mean ${mean(skipped).toFixed(2)}R) · all ${mean(pairs.map((p) => p.r)).toFixed(2)}R`);
  void rByKey;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
