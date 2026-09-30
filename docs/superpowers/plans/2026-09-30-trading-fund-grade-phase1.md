# Trading fund-grade phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give מערכת המסחר a fund-grade record and safety net on the Alpaca demo account: a per-signal log, a
broker-sourced NAV with per-strategy attribution, a model book that shows whether live matches research, a
health monitor with push alerts, a calibrated risk budget, and a fund screen in the app.

**Architecture:** New pure cores under `lib/trading/fund/*-core.ts` (unit tested with `node --test`), thin I/O
shells beside them, wired into the existing ticks (`runTick`, `runIntradayTick`, `runBookPass`,
`runCloseSleeve`). New tables are created by migration `0058_trading_fund.sql`. One new endpoint,
`GET /api/v1/trading/fund`, feeds a new card and screen in the Expo trading tab.

**Tech Stack:** Next.js route handlers on Vercel, Supabase Postgres (`myself` schema, service role), Alpaca paper
REST, Expo Router + React Native, TypeScript, `node --import tsx --test`.

## Global Constraints

- The spec is `docs/superpowers/specs/2026-09-30-trading-fund-grade-phase1-design.md`.
- Nothing new may block trading. Every new step inside a tick catches its own errors and appends to
  `summary.errors`.
- Paper only. `lib/trading/broker/alpaca.ts` stays hard-coded to `ALPACA_PAPER_BASE`.
- Account-level numbers are $ and % of equity. Never display a sum of R.
- Book inception is `2026-09-28` (`BOOK_INCEPTION`).
- Hebrew UI copy uses the user's terms: מערכת המסחר / האסטרטגיית מסחר. Never say "the agent" for the system.
- Every merge to `main` bumps `package.json` `version` (minor for features, patch for fixes).
- Migrations auto-apply on merge (`db-apply.yml`). Only additive schema changes in this plan.
- Tests: `npm test` (node test runner) and `npm run typecheck`; before a merge: `npm run verify`.

## File map

| File | Responsibility |
|---|---|
| `lib/trading/book/sleeves.ts` (new) | Pure: live sleeves, limits, `scaledSleeves`, `MODEL_ENVELOPE` |
| `lib/trading/book/engine.ts` (mod) | Imports the sleeves; writes the signal log; runs the model book |
| `lib/trading/book/close-sleeve.ts` (mod) | Signal log for IBS_CLOSE; notional × `risk_scale` |
| `supabase/migrations/0058_trading_fund.sql` (new) | `trading_book_signals`, `trading_nav_daily`, `trading_model_book`, `trading_settings.health` |
| `lib/trading/fund/signal-log.ts` (new) | Row builder (pure) + saver |
| `lib/trading/fund/nav-core.ts` (new) | Pure: history → NAV rows, marks, attribution |
| `lib/trading/fund/nav.ts` (new) | I/O: Alpaca history + positions + trades → `trading_nav_daily` |
| `lib/trading/strategy/multi.ts` (mod) | `BookResult.open_at_end` |
| `lib/trading/fund/model-book.ts` (new) | Model-book run + day extraction (pure) + saver |
| `lib/trading/fund/tracking.ts` (new) | Pure: live vs model, shortfall, missed signals |
| `lib/trading/fund/health-core.ts` (new) | Pure: `evaluateHealth`, `alertsToSend` |
| `lib/trading/fund/health.ts` (new) | I/O: snapshot, stop repair, alerts, persist |
| `lib/trading/engine.ts`, `lib/trading/intraday-engine.ts` (mod) | Call `updateNav` / `runHealthChecks` |
| `lib/trading/service-fund.ts` (new) + `app/api/v1/trading/fund/route.ts` (new) | `FundView` |
| `lib/trading/types-client.ts` (mod) | `FundView`, `HealthReport` client types |
| `mobile/src/api/resources.ts`, `mobile/src/query/keys.ts` (mod) | Client + query key |
| `mobile/src/components/trading/fund.tsx` (new) | `FundCard`, `HealthBadge` |
| `mobile/app/trading-fund.tsx` (new), `mobile/app/(tabs)/trading.tsx` (mod), `mobile/src/components/trading/blocks.tsx` (mod) | Screen, card, hub link |
| `lib/i18n/messages.ts` (mod) | `trading.fund.*` he + en |
| `scripts/trading/risk-budget.ts` (new) | Risk-scale calibration |
| `lib/trading/config.ts` (mod) | Kill switch 0.25 → 0.20 |

PRs: **A** = Tasks 1–5 (2.16.0) · **B** = Tasks 6–7 (2.17.0) · **C** = Task 8 (2.18.0) · **D** = Tasks 9–10 (2.19.0) ·
**E** = Task 11 (2.19.1) · **F** = Task 12 (2.19.2).

---

### Task 1: Pure sleeves module

**Files:**
- Create: `lib/trading/book/sleeves.ts`
- Modify: `lib/trading/book/engine.ts` (remove the `BOOK_SLEEVES`, `RETIRED_DEFS`, `BOOK_LIMITS` definitions, import and re-export them instead)
- Test: `lib/__tests__/trading-fund-sleeves.test.ts`

**Interfaces:**
- Produces: `BOOK_SLEEVES: Sleeve[]`, `RETIRED_DEFS: StrategyDef[]`, `BOOK_LIMITS`, `scaledSleeves(scale: number, sleeves?: Sleeve[]): Sleeve[]`, `MODEL_ENVELOPE: BookEnvelope`, `sleevesForGroup(group: "CRYPTO" | "STOCKS", sleeves: Sleeve[]): Sleeve[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BOOK_LIMITS, BOOK_SLEEVES, MODEL_ENVELOPE, scaledSleeves, sleevesForGroup } from "../trading/book/sleeves";

describe("book sleeves", () => {
  it("scales risk per trade and keeps the slots", () => {
    const s = scaledSleeves(0.5);
    assert.equal(s.length, BOOK_SLEEVES.length);
    s.forEach((x, i) => {
      assert.equal(x.risk_pct, BOOK_SLEEVES[i].risk_pct * 0.5);
      assert.equal(x.max_positions, BOOK_SLEEVES[i].max_positions);
      assert.equal(x.def, BOOK_SLEEVES[i].def);
    });
  });
  it("model envelope mirrors the live limits", () => {
    assert.equal(MODEL_ENVELOPE.max_gross, BOOK_LIMITS.max_gross);
    assert.equal(MODEL_ENVELOPE.max_positions, BOOK_LIMITS.max_positions);
  });
  it("splits sleeves by pass group", () => {
    assert.deepEqual(sleevesForGroup("CRYPTO", BOOK_SLEEVES).map((s) => s.def.id), ["CRYPTO_TREND"]);
    assert.deepEqual(sleevesForGroup("STOCKS", BOOK_SLEEVES).map((s) => s.def.id), ["MOMENTUM", "ASSET_ROTATION", "REVERSAL"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test lib/__tests__/trading-fund-sleeves.test.ts`
Expected: FAIL, `Cannot find module '../trading/book/sleeves'`

- [ ] **Step 3: Implement**

`lib/trading/book/sleeves.ts`:

```ts
import { RISK_ENVELOPE } from "../config";
import { assetRotation, cryptoTrend, momentum, pullback, reversal, type BookEnvelope, type Sleeve, type StrategyDef, type StrategyGroup } from "../strategy/multi";

/**
 * The live book's sleeves and caps — pure, so the model book, the research scripts and the dashboard share them
 * without importing the tick. Evidence: docs/trading/multi-strategy.md.
 */
export const BOOK_SLEEVES: Sleeve[] = [
  { def: cryptoTrend(), risk_pct: 0.005, max_positions: 6 },
  { def: momentum(), risk_pct: 0.003, max_positions: 20 },
  { def: assetRotation(), risk_pct: 0.008, max_positions: 5 },
  // Mean reversion needs many small slots: signals cluster in selloffs and 10 big slots fill on the first day.
  { def: reversal(), risk_pct: 0.0025, max_positions: 40 },
];

/** Families no longer entered whose open positions are still managed to their exits. */
export const RETIRED_DEFS: StrategyDef[] = [pullback()];

export const BOOK_LIMITS = Object.freeze({
  max_positions: 75,
  max_notional: 0.2,
  /** Stock gross notional (book positions + queued entries) as a share of equity — research: 1.0 → max DD 21% vs 30% at 1.5. */
  max_gross: 1.0,
  max_risk_per_trade: 0.01,
});

/** The research engine's envelope matching the live limits (model book, risk-budget calibration). */
export const MODEL_ENVELOPE: BookEnvelope = {
  max_positions: BOOK_LIMITS.max_positions,
  max_open_risk: RISK_ENVELOPE.ACCOUNT_MAX_OPEN_RISK_PCT,
  max_notional: BOOK_LIMITS.max_notional,
  max_gross: BOOK_LIMITS.max_gross,
};

/** Sleeves at `scale` × their research risk (trading_settings.risk_scale). */
export function scaledSleeves(scale: number, sleeves: Sleeve[] = BOOK_SLEEVES): Sleeve[] {
  return sleeves.map((s) => ({ ...s, risk_pct: s.risk_pct * scale }));
}

/** Sleeves a pass of `group` scans (crypto pass: crypto sleeves; stock pass: stock and ETF sleeves). */
export function sleevesForGroup(group: "CRYPTO" | "STOCKS", sleeves: Sleeve[]): Sleeve[] {
  return sleeves.filter((s) => s.def.groups.some((g: StrategyGroup) => (group === "CRYPTO" ? g === "CRYPTO" : g !== "CRYPTO")));
}
```

In `lib/trading/book/engine.ts`, delete the local `BOOK_SLEEVES`, `RETIRED_DEFS` and `BOOK_LIMITS` and add:

```ts
import { BOOK_LIMITS, BOOK_SLEEVES, RETIRED_DEFS, sleevesForGroup } from "./sleeves";
export { BOOK_LIMITS, BOOK_SLEEVES } from "./sleeves";
```

Drop the now-unused `assetRotation, cryptoTrend, momentum, pullback, reversal` imports from engine.ts (keep what
is still used). In `runBookPass`, replace the manual group filter
`if (!sleeve.def.groups.some(...)) continue;` with `for (const sleeve of sleevesForGroup(group, BOOK_SLEEVES))`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `node --import tsx --test lib/__tests__/trading-fund-sleeves.test.ts lib/__tests__/trading-book.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add lib/trading/book/sleeves.ts lib/trading/book/engine.ts lib/__tests__/trading-fund-sleeves.test.ts
git commit -m "refactor(trading): pure book sleeves module"
```

---

### Task 2: Migration 0058

**Files:**
- Create: `supabase/migrations/0058_trading_fund.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Fund-grade phase 1 (docs/superpowers/specs/2026-09-30-trading-fund-grade-phase1-design.md).
--
-- trading_book_signals: every book signal of every pass and what happened to it (ENTERED or the block reason).
-- trading_nav_daily: the account's daily NAV from Alpaca portfolio history, cash flows split out, per-strategy
--   attribution (by_strategy, $) with an exact residual (unattributed), per-trade marks for the next day's delta.
-- trading_model_book: the research engine's book on the live universe (per group and bar) — live vs model.
-- trading_settings.health: the last health report (lib/trading/fund/health.ts).

create table if not exists myself.trading_book_signals (
  id bigint generated always as identity primary key,
  bar date not null,
  grp text not null,
  strategy text not null,
  symbol text not null,
  score double precision,
  entry double precision not null,
  stop double precision not null,
  target double precision,
  planned_size double precision,
  planned_risk_usd double precision,
  decision text not null,
  trade_id uuid,
  created_at timestamptz not null default now(),
  unique (bar, strategy, symbol)
);
alter table myself.trading_book_signals enable row level security;
create index if not exists trading_book_signals_bar_idx on myself.trading_book_signals (bar desc);
create index if not exists trading_book_signals_trade_idx on myself.trading_book_signals (trade_id) where trade_id is not null;

create table if not exists myself.trading_nav_daily (
  day date primary key,
  equity numeric(16, 2) not null,
  cash_flow numeric(16, 2) not null default 0,
  pnl numeric(16, 2) not null default 0,
  twr_return double precision not null default 0,
  nav_index double precision not null,
  peak_index double precision not null,
  drawdown double precision not null default 0,
  pre_book boolean not null default false,
  by_strategy jsonb,
  unattributed numeric(16, 2),
  marks jsonb,
  updated_at timestamptz not null default now()
);
alter table myself.trading_nav_daily enable row level security;

create table if not exists myself.trading_model_book (
  day date not null,
  grp text not null,
  day_return double precision not null,
  equity double precision not null,
  positions jsonb not null default '[]'::jsonb,
  trades jsonb not null default '[]'::jsonb,
  duration_ms integer,
  created_at timestamptz not null default now(),
  primary key (day, grp)
);
alter table myself.trading_model_book enable row level security;

alter table myself.trading_settings add column if not exists health jsonb;
```

- [ ] **Step 2: Dry-run it in a rolled-back transaction**

Use the Supabase `execute_sql` tool on project `roeefqpdbftlndzsvhfj` with `begin; <file contents>; rollback;`
Expected: no error

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0058_trading_fund.sql
git commit -m "feat(trading): fund tables (signals, NAV, model book, health)"
```

---

### Task 3: Signal log

**Files:**
- Create: `lib/trading/fund/signal-log.ts`
- Modify: `lib/trading/book/engine.ts` (`runBookPass` entry loop)
- Modify: `lib/trading/book/close-sleeve.ts` (`runCloseSleeve` entry loop)
- Test: `lib/__tests__/trading-fund-signal-log.test.ts`

**Interfaces:**
- Produces: `type SignalLogRow`, `signalRow(input): SignalLogRow`, `dedupeSignalRows(rows): SignalLogRow[]`, `saveSignalLog(rows: SignalLogRow[], errors: string[]): Promise<void>`, `ENTERED = "ENTERED"`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dedupeSignalRows, signalRow } from "../trading/fund/signal-log";

const sig = { strategy: "REVERSAL", score: 0.8, entry: 100, stop: 90, target: null, a: { symbol: "NVDA" } } as never;

describe("signal log rows", () => {
  it("records an entry with its planned size and trade", () => {
    const r = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "ENTERED", size: 10, riskUsd: 100, tradeId: "t1" });
    assert.deepEqual(r, { bar: "2026-09-29", grp: "STOCKS", strategy: "REVERSAL", symbol: "NVDA", score: 0.8, entry: 100, stop: 90, target: null, planned_size: 10, planned_risk_usd: 100, decision: "ENTERED", trade_id: "t1" });
  });
  it("records a block with nulls for size and trade", () => {
    const r = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "MAX_GROSS" });
    assert.equal(r.planned_size, null);
    assert.equal(r.trade_id, null);
    assert.equal(r.decision, "MAX_GROSS");
  });
  it("keeps the last decision per (bar, strategy, symbol)", () => {
    const a = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "MAX_GROSS" });
    const b = signalRow({ bar: "2026-09-29", grp: "STOCKS", sig, decision: "ENTERED", tradeId: "t1" });
    assert.deepEqual(dedupeSignalRows([a, b]), [b]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test lib/__tests__/trading-fund-signal-log.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Implement `lib/trading/fund/signal-log.ts`**

```ts
import { getSupabase } from "@/lib/supabase";
import type { Signal } from "../strategy/multi";

/** What happened to a book signal: ENTERED, or the block reason the pass used. */
export const ENTERED = "ENTERED";

export type SignalLogRow = {
  bar: string;
  grp: string;
  strategy: string;
  symbol: string;
  score: number | null;
  entry: number;
  stop: number;
  target: number | null;
  planned_size: number | null;
  planned_risk_usd: number | null;
  decision: string;
  trade_id: string | null;
};

type SigLike = Pick<Signal, "strategy" | "score" | "entry" | "stop" | "target"> & { a: { symbol: string } };

export function signalRow(input: { bar: string; grp: string; sig: SigLike; decision: string; size?: number | null; riskUsd?: number | null; tradeId?: string | null }): SignalLogRow {
  const { sig } = input;
  return {
    bar: input.bar,
    grp: input.grp,
    strategy: sig.strategy,
    symbol: sig.a.symbol,
    score: Number.isFinite(sig.score) ? sig.score : null,
    entry: sig.entry,
    stop: sig.stop,
    target: sig.target ?? null,
    planned_size: input.size ?? null,
    planned_risk_usd: input.riskUsd ?? null,
    decision: input.decision,
    trade_id: input.tradeId ?? null,
  };
}

/** One row per (bar, strategy, symbol), last decision wins — Postgres rejects an upsert batch touching a row twice. */
export function dedupeSignalRows(rows: SignalLogRow[]): SignalLogRow[] {
  const m = new Map<string, SignalLogRow>();
  for (const r of rows) m.set(`${r.bar}|${r.strategy}|${r.symbol}`, r);
  return [...m.values()];
}

/** Never throws: the log must not block trading. */
export async function saveSignalLog(rows: SignalLogRow[], errors: string[]): Promise<void> {
  if (!rows.length) return;
  try {
    const { error } = await getSupabase().from("trading_book_signals").upsert(dedupeSignalRows(rows), { onConflict: "bar,strategy,symbol" });
    if (error) errors.push(`signal_log: ${error.message.slice(0, 120)}`);
  } catch (err) {
    errors.push(`signal_log: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
  }
}
```

- [ ] **Step 4: Wire into `runBookPass`** (`lib/trading/book/engine.ts`)

Add the import `import { ENTERED, saveSignalLog, signalRow, type SignalLogRow } from "../fund/signal-log";`. Right
after `summary.signals = signals.length;` add:

```ts
  const log: SignalLogRow[] = [];
  const decide = (sig: Signal, decision: string, extra: { size?: number; riskUsd?: number; tradeId?: string } = {}) =>
    log.push(signalRow({ bar: barIso, grp: group, sig, decision, ...extra }));
```

In the signal loop, every `block(X); continue;` becomes `block(X); decide(sig, X); continue;` (for
`TIME_BUDGET`: `block("TIME_BUDGET"); decide(sig, "TIME_BUDGET"); break;`). `SIZE` passes the size when known.
The account-envelope block becomes:

```ts
    if (blocks.length) {
      blocks.forEach(block);
      decide(sig, blocks.join(","), { size: sized.size, riskUsd: sized.riskUsd });
      continue;
    }
```

The entry:

```ts
      const id = await enter(sig, sleeve, sized.size, sized.riskUsd, settings, now);
      if (!id) {
        decide(sig, "ENTER_FAILED", { size: sized.size, riskUsd: sized.riskUsd });
        continue;
      }
      decide(sig, ENTERED, { size: sized.size, riskUsd: sized.riskUsd, tradeId: id });
```

and the `catch` adds `decide(sig, "ENTER_ERROR", { size: sized.size, riskUsd: sized.riskUsd });` (hoist `sized`
with `let sized: ReturnType<typeof sizeSignal> = null;` above the `try` if needed for scope). Just before
`return summary;` at the end of the function add `await saveSignalLog(log, summary.errors);`.

- [ ] **Step 5: Wire into `runCloseSleeve`** (`lib/trading/book/close-sleeve.ts`)

Same pattern with `grp: "IBS"` and `bar: dayIso(dayMs)` (import `dayIso` from `./bars`, the same `decide`
helper). Each `block(...)` gets a matching `decide(sig, …)`. `ENTERED` goes with `tradeId: id` and the size.
Call `await saveSignalLog(log, summary.errors);` before `return finish(summary);` at the end of the loop.

- [ ] **Step 6: Run the tests and typecheck**

Run: `node --import tsx --test lib/__tests__/trading-fund-signal-log.test.ts lib/__tests__/trading-book.test.ts lib/__tests__/trading-families.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/trading/fund/signal-log.ts lib/trading/book/engine.ts lib/trading/book/close-sleeve.ts lib/__tests__/trading-fund-signal-log.test.ts
git commit -m "feat(trading): log every book signal and its decision"
```

---

### Task 4: NAV core (pure)

**Files:**
- Create: `lib/trading/fund/nav-core.ts`
- Test: `lib/__tests__/trading-fund-nav.test.ts`

**Interfaces:**
- Produces:
  - `BOOK_INCEPTION = "2026-09-28"`
  - `EXTERNAL_FLOW_TYPES`
  - `type PortfolioHistory = { timestamp: number[]; equity: (number | null)[]; cashflow?: Record<string, number[]> }`
  - `type NavPoint = { day: string; equity: number; cash_flow: number }`
  - `historyPoints(h): NavPoint[]`
  - `type NavRow = { day; equity; cash_flow; pnl; twr_return; nav_index; peak_index; drawdown; pre_book }`
  - `chainNav(points, inception): NavRow[]`
  - `type Mark = { strategy: string; mark: number }`, `type Marks = Record<string, Mark>`
  - `buildMarks(input): Marks`
  - `attributeDay(prev: Marks | null, now: Marks, pnl: number): { by_strategy: Record<string, number>; unattributed: number } | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attributeDay, buildMarks, chainNav, historyPoints } from "../trading/fund/nav-core";

const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 1000;

describe("NAV from portfolio history", () => {
  it("splits deposits from P&L; fees stay in P&L", () => {
    const pts = historyPoints({
      timestamp: [day("2026-09-11"), day("2026-09-14"), day("2026-09-15"), day("2026-09-16")],
      equity: [0, 100000, 101000, 151500],
      cashflow: { JNLC: [0, 100000, 0, 50000], CFEE: [0, 0, -40, 0] },
    });
    assert.deepEqual(pts.map((p) => [p.day, p.cash_flow]), [["2026-09-14", 100000], ["2026-09-15", 0], ["2026-09-16", 50000]]);
    const rows = chainNav(pts, "2026-09-15");
    assert.equal(rows[0].nav_index, 100);
    assert.equal(rows[0].pre_book, true);
    assert.equal(rows[1].pnl, 1000);
    assert.equal(rows[1].twr_return, 0.01);
    assert.equal(rows[1].pre_book, false);
    // +500 on 101000 + 50000 deposited that day
    assert.equal(rows[2].pnl, 500);
    assert.ok(Math.abs(rows[2].twr_return - 500 / 151000) < 1e-12);
    assert.ok(Math.abs(rows[2].nav_index - 100 * 1.01 * (1 + 500 / 151000)) < 1e-9);
  });
  it("tracks the peak and drawdown of the index", () => {
    const rows = chainNav(
      [{ day: "a", equity: 100, cash_flow: 0 }, { day: "b", equity: 110, cash_flow: 0 }, { day: "c", equity: 99, cash_flow: 0 }],
      "a"
    );
    assert.equal(rows[1].peak_index, 110);
    assert.ok(Math.abs(rows[2].drawdown - 0.1) < 1e-12);
  });
});

describe("marks and attribution", () => {
  const open = [
    { id: "t1", symbol: "BTC", setup: "CRYPTO_TREND", strategy_version: "book" },
    { id: "t2", symbol: "NVDA", setup: "REVERSAL", strategy_version: "book" },
  ];
  it("marks open trades from broker unrealized P&L, untracked positions by symbol, closed trades by realized", () => {
    const marks = buildMarks({
      positions: [{ symbol: "BTC", unrealized_pl: 120, dust: false }, { symbol: "XYZ", unrealized_pl: -5, dust: false }, { symbol: "DOGE", unrealized_pl: 0, dust: true }],
      open,
      closed: [{ id: "t3", setup: "MOMENTUM", strategy_version: "book", realized_pnl: 300 }, { id: "t4", setup: null, strategy_version: "manual", realized_pnl: null }],
      prev: { t4: { strategy: "MANUAL", mark: -10 } },
    });
    assert.deepEqual(marks, {
      t1: { strategy: "CRYPTO_TREND", mark: 120 },
      "pos:XYZ": { strategy: "UNTRACKED", mark: -5 },
      t3: { strategy: "MOMENTUM", mark: 300 },
      t4: { strategy: "MANUAL", mark: -10 },
    });
  });
  it("attributes the day's P&L by mark change and keeps an exact residual", () => {
    const prev = { t1: { strategy: "CRYPTO_TREND", mark: 100 }, t3: { strategy: "MOMENTUM", mark: 250 }, gone: { strategy: "REVERSAL", mark: 80 } };
    const now = { t1: { strategy: "CRYPTO_TREND", mark: 120 }, t3: { strategy: "MOMENTUM", mark: 300 }, t5: { strategy: "REVERSAL", mark: -30 } };
    const a = attributeDay(prev, now, 45);
    assert.deepEqual(a, { by_strategy: { CRYPTO_TREND: 20, MOMENTUM: 50, REVERSAL: -30 }, unattributed: 5 });
  });
  it("cannot attribute without the previous day's marks", () => {
    assert.equal(attributeDay(null, {}, 10), null);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test lib/__tests__/trading-fund-nav.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Implement `lib/trading/fund/nav-core.ts`**

```ts
import { strategyKey } from "../strategy-options";

/** First live day of the multi-strategy book — NAV before it is the intraday era (kept, labelled pre_book). */
export const BOOK_INCEPTION = "2026-09-28";

/**
 * Money moving in or out of the account. Everything else in Alpaca's cashflow map (CFEE crypto fees, FEE,
 * dividends, interest) is performance and stays in P&L.
 */
export const EXTERNAL_FLOW_TYPES = ["CSD", "CSW", "JNLC", "JNLS", "ACATC", "ACATS"] as const;

export type PortfolioHistory = { timestamp: number[]; equity: (number | null)[]; cashflow?: Record<string, number[]> };
export type NavPoint = { day: string; equity: number; cash_flow: number };

/** Alpaca daily history → one point per session with equity, net external flow on that session. */
export function historyPoints(h: PortfolioHistory): NavPoint[] {
  const out: NavPoint[] = [];
  h.timestamp.forEach((ts, i) => {
    const equity = Number(h.equity[i]);
    if (!Number.isFinite(equity) || equity <= 0) return;
    const flow = EXTERNAL_FLOW_TYPES.reduce((s, k) => s + (Number(h.cashflow?.[k]?.[i]) || 0), 0);
    out.push({ day: new Date(ts * 1000).toISOString().slice(0, 10), equity, cash_flow: flow });
  });
  return out;
}

export type NavRow = {
  day: string;
  equity: number;
  cash_flow: number;
  pnl: number;
  twr_return: number;
  nav_index: number;
  peak_index: number;
  drawdown: number;
  pre_book: boolean;
};

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Time-weighted chain. A flow is assumed to arrive at the start of its session: that session's return is
 * pnl ÷ (previous equity + flow), so a deposit neither creates nor dilutes performance.
 */
export function chainNav(points: NavPoint[], inception: string): NavRow[] {
  const out: NavRow[] = [];
  let index = 100;
  let peak = 100;
  points.forEach((p, i) => {
    const prev = i > 0 ? points[i - 1] : null;
    const pnl = prev ? p.equity - prev.equity - p.cash_flow : 0;
    const base = prev ? prev.equity + Math.max(0, p.cash_flow) : 0;
    const twr = prev && base > 0 ? pnl / base : 0;
    index *= 1 + twr;
    peak = Math.max(peak, index);
    out.push({ day: p.day, equity: r2(p.equity), cash_flow: r2(p.cash_flow), pnl: r2(pnl), twr_return: twr, nav_index: index, peak_index: peak, drawdown: peak > 0 ? 1 - index / peak : 0, pre_book: p.day < inception });
  });
  return out;
}

/** Value of a trade's P&L at a moment: unrealized while open (broker), realized once closed (fills). */
export type Mark = { strategy: string; mark: number };
export type Marks = Record<string, Mark>;

type TradeKey = { id: string; setup: string | null; strategy_version: string | null };

export function buildMarks(input: {
  positions: { symbol: string; unrealized_pl: number; dust: boolean }[];
  open: (TradeKey & { symbol: string })[];
  closed: (TradeKey & { realized_pnl: number | null })[];
  prev: Marks | null;
}): Marks {
  const marks: Marks = {};
  for (const p of input.positions) {
    if (p.dust || !Number.isFinite(p.unrealized_pl)) continue;
    const t = input.open.find((x) => x.symbol === p.symbol);
    if (t) marks[t.id] = { strategy: strategyKey(t), mark: r2(p.unrealized_pl) };
    else marks[`pos:${p.symbol}`] = { strategy: "UNTRACKED", mark: r2(p.unrealized_pl) };
  }
  for (const c of input.closed) {
    // Not settled from fills yet: carry the last mark (no P&L invented); settlement shows up as a later delta.
    const mark = c.realized_pnl ?? input.prev?.[c.id]?.mark;
    if (mark === undefined || mark === null || !Number.isFinite(mark)) continue;
    marks[c.id] = { strategy: strategyKey(c), mark: r2(mark) };
  }
  return marks;
}

/**
 * P&L of each strategy on a day = Σ (mark now − mark at the previous day's close) over the trades marked now.
 * A trade that left the set (closed before the day) contributes nothing. Whatever the marks do not explain
 * (fees in kind, dust, interest, timing between the tick and Alpaca's session close) is `unattributed`, so
 * Σ by_strategy + unattributed = pnl exactly.
 */
export function attributeDay(prev: Marks | null, now: Marks, pnl: number): { by_strategy: Record<string, number>; unattributed: number } | null {
  if (!prev) return null;
  const by: Record<string, number> = {};
  for (const [id, m] of Object.entries(now)) {
    const d = m.mark - (prev[id]?.mark ?? 0);
    by[m.strategy] = r2((by[m.strategy] ?? 0) + d);
  }
  const explained = Object.values(by).reduce((s, x) => s + x, 0);
  return { by_strategy: by, unattributed: r2(pnl - explained) };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --import tsx --test lib/__tests__/trading-fund-nav.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/trading/fund/nav-core.ts lib/__tests__/trading-fund-nav.test.ts
git commit -m "feat(trading): NAV chain and per-strategy attribution (pure)"
```

---

### Task 5: NAV I/O + tick wiring (then PR A)

**Files:**
- Modify: `lib/trading/broker/alpaca.ts` (add `portfolioHistory` to the `alpaca` object)
- Create: `lib/trading/fund/nav.ts`
- Modify: `lib/trading/engine.ts` (call `updateNav` after the equity snapshot)
- Modify: `package.json` (2.16.0)

**Interfaces:**
- Consumes: Task 4 exports
- Produces: `updateNav(now: number): Promise<{ day: string | null; rows: number; attributed: boolean }>`

- [ ] **Step 1: Alpaca client method** — inside `export const alpaca = { … }`, after `positions`:

```ts
  /** Daily equity per session with Alpaca's cash-flow breakdown (JNLC deposits, CFEE fees, …). */
  portfolioHistory: (input: { period: string; timeframe: "1D" }) =>
    call<{ timestamp: number[]; equity: (number | null)[]; profit_loss: (number | null)[]; cashflow?: Record<string, number[]> }>(
      "GET",
      `/v2/account/portfolio/history?period=${encodeURIComponent(input.period)}&timeframe=${input.timeframe}&cashflow_types=ALL`
    ),
```

- [ ] **Step 2: `lib/trading/fund/nav.ts`**

```ts
import { getSupabase } from "@/lib/supabase";
import { alpaca, fromAlpacaPositionSymbol, isDustPosition } from "../broker/alpaca";
import { getOpenTrades } from "../store";
import { attributeDay, BOOK_INCEPTION, buildMarks, chainNav, historyPoints, type Marks } from "./nav-core";

const D1 = 86_400_000;

/**
 * Refresh the NAV ledger from the broker. Every main tick: the whole chain is recomputed from a year of Alpaca
 * history (cheap, idempotent), and the current session also gets its attribution and per-trade marks. Earlier
 * sessions keep the attribution they were given on their own day.
 */
export async function updateNav(now: number): Promise<{ day: string | null; rows: number; attributed: boolean }> {
  const history = await alpaca.portfolioHistory({ period: "1A", timeframe: "1D" });
  const rows = chainNav(historyPoints(history), BOOK_INCEPTION);
  if (!rows.length) return { day: null, rows: 0, attributed: false };
  const db = getSupabase();
  const current = rows[rows.length - 1];

  const { error: chainErr } = await db.from("trading_nav_daily").upsert(rows.map((r) => ({ ...r, updated_at: new Date(now).toISOString() })), { onConflict: "day", defaultToNull: false });
  if (chainErr) throw new Error(`nav chain: ${chainErr.message}`);

  const [positions, open, closedRes, prevRes] = await Promise.all([
    alpaca.positions(),
    getOpenTrades(),
    db
      .from("trading_trades")
      .select("id, setup, strategy_version, realized_pnl")
      .eq("state", "CLOSED")
      .not("broker", "is", null)
      .gte("closed_at", new Date(now - 3 * D1).toISOString()),
    db.from("trading_nav_daily").select("day, marks").lt("day", current.day).order("day", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (closedRes.error) throw new Error(`nav closed trades: ${closedRes.error.message}`);
  const prevMarks = (prevRes.data?.marks as Marks | null) ?? null;
  const marks = buildMarks({
    positions: positions.map((p) => ({ symbol: fromAlpacaPositionSymbol(p.symbol), unrealized_pl: Number(p.unrealized_pl), dust: isDustPosition(p) })),
    open: open.filter((t) => t.broker).map((t) => ({ id: t.id, symbol: t.symbol, setup: t.setup, strategy_version: t.strategy_version })),
    closed: (closedRes.data ?? []).map((c) => ({ id: String(c.id), setup: (c.setup as string) ?? null, strategy_version: (c.strategy_version as string) ?? null, realized_pnl: c.realized_pnl === null ? null : Number(c.realized_pnl) })),
    prev: prevMarks,
  });
  const attr = attributeDay(prevMarks, marks, current.pnl);
  const { error } = await db
    .from("trading_nav_daily")
    .update({ marks, by_strategy: attr?.by_strategy ?? null, unattributed: attr?.unattributed ?? null, updated_at: new Date(now).toISOString() })
    .eq("day", current.day);
  if (error) throw new Error(`nav attribution: ${error.message}`);
  return { day: current.day, rows: rows.length, attributed: attr !== null };
}
```

(`defaultToNull: false` makes PostgREST leave `by_strategy`/`marks`/`unattributed` untouched on existing rows —
they are not in the payload.)

- [ ] **Step 3: Wire into `runTick`** (`lib/trading/engine.ts`) — right after the
`trading_equity_snapshots` upsert:

```ts
  if (settings.execution_venue === "ALPACA_PAPER" && isAlpacaConfigured()) {
    try {
      await updateNav(now);
    } catch (err) {
      summary.errors.push(`nav: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    }
  }
```

with `import { updateNav } from "./fund/nav";` (and `isAlpacaConfigured` from `./broker/alpaca` if it is not
already imported).

- [ ] **Step 4: Verify against the live demo account, read-only**

Write a scratch script `$SCRATCH/nav-dry.ts` that calls `alpaca.portfolioHistory` and prints
`chainNav(historyPoints(h), BOOK_INCEPTION)` (no DB writes), and run it:
`set -a; source .env.local; set +a; node --import tsx $SCRATCH/nav-dry.ts`
Expected: rows from 2026-09-14; 2026-09-14 has cash_flow 100000 and pnl 0; the last row's equity is close to the
account's equity; `pre_book` is false only from 2026-09-28.

- [ ] **Step 5: Bump the version, verify, commit, open PR A, merge, verify in production**

`package.json` version → `2.16.0`. Run `npm run verify` (expected: all green).

```bash
git add -A lib/trading supabase/migrations/0058_trading_fund.sql package.json lib/__tests__
git commit -m "feat(trading): NAV ledger + signal log (2.16.0)"
git push -u origin trading/fund-grade-phase1
gh pr create --title "Trading fund-grade 1/6: signal log + NAV ledger (2.16.0)" --body "<summary + test plan>"
gh pr merge --squash --delete-branch=false
```

After the Vercel deploy and one tick (pg_cron runs at minutes 3/18/33/48):
`trading_nav_daily` has rows up to today; today's row has `marks`; the next day's row has `by_strategy`.
`trading_book_signals` fills at the next book pass. `last_tick_summary.errors` has no `nav:` / `signal_log:`.

---

### Task 6: Model book (then part of PR B)

**Files:**
- Modify: `lib/trading/strategy/multi.ts` (`BookResult.open_at_end`)
- Create: `lib/trading/fund/model-book.ts`
- Modify: `lib/trading/book/engine.ts` (call it at the end of `runBookPass`)
- Test: `lib/__tests__/trading-fund-model.test.ts`

**Interfaces:**
- Produces:
  - `MODEL_WINDOW_DAYS = 200`
  - `type ModelPosition = { symbol: string; strategy: string; size: number; entry: number; stop: number; opened_at: string | null; pending: boolean }`
  - `type ModelDay = { day: string; grp: "CRYPTO" | "STOCKS"; day_return: number; equity: number; positions: ModelPosition[]; trades: { symbol: string; strategy: string; pnl: number; r: number; exit_reason: string }[] }`
  - `modelDayFrom(result: BookResult, barT: number, grp): ModelDay | null`
  - `runModelBook(input: { group; assets: MultiAsset[]; references; bar: string; riskScale: number }): ModelDay | null`
  - `saveModelDay(day: ModelDay, durationMs: number, errors: string[]): Promise<void>`

- [ ] **Step 1: `open_at_end` in `runBook`** (`lib/trading/strategy/multi.ts`)

Add to `BookResult`:

```ts
  /** Positions still open (or queued for the next open) at `end`, before the final mark-to-market close. */
  open_at_end: { symbol: string; strategy: StrategyId; size: number; entry: number; stop: number; opened_at: number | null; pending: boolean }[];
```

Just before the final `for (const l of live) { … forceClose(…) … }` loop:

```ts
  const open_at_end = live.map((l) => ({
    symbol: l.a.symbol,
    strategy: l.sleeve.def.id,
    size: l.pos.size,
    entry: l.pos.entry_price ?? l.pos.entry_limit,
    stop: l.pos.stop_price,
    opened_at: l.pos.opened_at,
    pending: l.pos.state === "PENDING" || Boolean(l.enter_next_open),
  }));
```

and return `open_at_end` in the result object.

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { modelDayFrom } from "../trading/fund/model-book";

const T = Date.parse("2026-09-29T00:00:00Z");
const D1 = 86_400_000;
const result = {
  equity: [{ t: T - D1, equity: 100_000 }, { t: T, equity: 101_000 }],
  trades: [
    { strategy: "REVERSAL", symbol: "AMD", closed_at: T, pnl: 200, r: 0.8, exit_reason: "SIGNAL" },
    { strategy: "MOMENTUM", symbol: "NVDA", closed_at: T, pnl: 50, r: 0.1, exit_reason: "MANUAL" },
    { strategy: "REVERSAL", symbol: "OLD", closed_at: T - D1, pnl: 9, r: 0.1, exit_reason: "SIGNAL" },
  ],
  open_at_end: [{ symbol: "NVDA", strategy: "MOMENTUM", size: 3, entry: 100, stop: 80, opened_at: T - 5 * D1, pending: false }],
} as never;

describe("model day", () => {
  it("takes the bar's return, open positions and the trades the strategies closed on the bar", () => {
    const d = modelDayFrom(result, T, "STOCKS")!;
    assert.equal(d.day, "2026-09-29");
    assert.ok(Math.abs(d.day_return - 0.01) < 1e-12);
    assert.equal(d.equity, 101_000);
    assert.deepEqual(d.positions.map((p) => p.symbol), ["NVDA"]);
    assert.equal(d.positions[0].opened_at, "2026-09-24");
    assert.deepEqual(d.trades.map((x) => x.symbol), ["AMD"]);
  });
  it("is null when the bar is not the last point of the curve", () => {
    assert.equal(modelDayFrom(result, T + D1, "STOCKS"), null);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --import tsx --test lib/__tests__/trading-fund-model.test.ts`
Expected: FAIL, module not found

- [ ] **Step 4: Implement `lib/trading/fund/model-book.ts`**

```ts
import { getSupabase } from "@/lib/supabase";
import { MODEL_ENVELOPE, scaledSleeves, sleevesForGroup } from "../book/sleeves";
import { runBook, type BookResult, type MultiAsset, type ScanContext } from "../strategy/multi";

/**
 * The model book: what the research engine (runBook, same strategy code, modelled costs, perfect execution)
 * would have done on the live universe. Run per group after each pass on the assets the pass already loaded,
 * over a trailing window long enough to be warmed up (monthly sleeves re-rank twice, reversal holds ≤ 10 days).
 * Only the bar's return and holdings are kept: chaining the stored daily returns gives the model NAV.
 */
export const MODEL_WINDOW_DAYS = 200;
const D1 = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export type ModelPosition = { symbol: string; strategy: string; size: number; entry: number; stop: number; opened_at: string | null; pending: boolean };
export type ModelDay = {
  day: string;
  grp: "CRYPTO" | "STOCKS";
  day_return: number;
  equity: number;
  positions: ModelPosition[];
  trades: { symbol: string; strategy: string; pnl: number; r: number; exit_reason: string }[];
};

export function modelDayFrom(result: Pick<BookResult, "equity" | "trades" | "open_at_end">, barT: number, grp: ModelDay["grp"]): ModelDay | null {
  const n = result.equity.length;
  if (n < 2 || result.equity[n - 1].t !== barT) return null;
  const last = result.equity[n - 1].equity;
  const prev = result.equity[n - 2].equity;
  return {
    day: iso(barT),
    grp,
    day_return: prev > 0 ? last / prev - 1 : 0,
    equity: Math.round(last * 100) / 100,
    positions: result.open_at_end.map((p) => ({ ...p, opened_at: p.opened_at === null ? null : iso(p.opened_at) })),
    // "MANUAL" is runBook's end-of-window mark-to-market close, not a strategy exit.
    trades: result.trades.filter((x) => x.closed_at === barT && x.exit_reason !== "MANUAL").map((x) => ({ symbol: x.symbol, strategy: x.strategy, pnl: Math.round(x.pnl * 100) / 100, r: Math.round(x.r * 1000) / 1000, exit_reason: x.exit_reason })),
  };
}

export function runModelBook(input: { group: ModelDay["grp"]; assets: MultiAsset[]; references: ScanContext["references"]; bar: string; riskScale: number }): ModelDay | null {
  const t = Date.parse(`${input.bar}T00:00:00Z`);
  const result = runBook({
    assets: input.assets,
    references: input.references,
    sleeves: sleevesForGroup(input.group, scaledSleeves(input.riskScale)),
    envelope: MODEL_ENVELOPE,
    start: t - MODEL_WINDOW_DAYS * D1,
    end: t,
    starting_equity: 100_000,
    stock_execution: "NEXT_OPEN",
  });
  return modelDayFrom(result, t, input.group);
}

export async function saveModelDay(day: ModelDay, durationMs: number, errors: string[]): Promise<void> {
  try {
    const { error } = await getSupabase().from("trading_model_book").upsert({ ...day, duration_ms: durationMs }, { onConflict: "day,grp" });
    if (error) errors.push(`model_book: ${error.message.slice(0, 120)}`);
  } catch (err) {
    errors.push(`model_book: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
  }
}
```

- [ ] **Step 5: Run the model in `runBookPass`**

In `lib/trading/book/engine.ts`, add `import { runModelBook, saveModelDay } from "../fund/model-book";` and a
helper:

```ts
/** Research engine on the same bars — the live-vs-model comparison. Never blocks the pass. */
async function recordModel(group: BookGroupKey, pool: MultiAsset[], refs: ScanContext["references"], barIso: string, riskScale: number, deadline: number, errors: string[]) {
  if (Date.now() > deadline - 20_000) {
    errors.push("model_skipped_time");
    return;
  }
  const t0 = Date.now();
  try {
    const day = runModelBook({ group, assets: pool, references: refs, bar: barIso, riskScale });
    if (day) await saveModelDay(day, Date.now() - t0, errors);
    else errors.push("model_no_bar");
  } catch (err) {
    errors.push(`model: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
  }
}
```

Call `await recordModel(group, pool, refs, barIso, settings.risk_scale, deadline, summary.errors);` right before
`await saveSignalLog(log, summary.errors);` at the end of `runBookPass` (`refs` is the `{ STOCKS, CRYPTO }`
object built there; import `type ScanContext` from `../strategy/multi`).

- [ ] **Step 6: Tests, typecheck, commit**

Run: `node --import tsx --test lib/__tests__/trading-fund-model.test.ts lib/__tests__/trading-book.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS

```bash
git add lib/trading/strategy/multi.ts lib/trading/fund/model-book.ts lib/trading/book/engine.ts lib/__tests__/trading-fund-model.test.ts
git commit -m "feat(trading): model book per pass (live vs research engine)"
```

---

### Task 7: Tracking core (end of PR B)

**Files:**
- Create: `lib/trading/fund/tracking.ts`
- Test: `lib/__tests__/trading-fund-tracking.test.ts`
- Modify: `package.json` (2.17.0)

**Interfaces:**
- Produces:
  - `GROUP_OF_STRATEGY`
  - `type NavLite = { day: string; equity: number; by_strategy: Record<string, number> | null }`
  - `type ModelLite = { day: string; grp: string; day_return: number }`
  - `type TrackPoint = { day: string; live: number; model: number; diff: number }`
  - `trackingSeries(nav: NavLite[], model: ModelLite[], grp: "CRYPTO" | "STOCKS"): TrackPoint[]`
  - `trackingStats(series: TrackPoint[], window?: number): { days: number; live_cum: number; model_cum: number; diff_cum: number; te_annual: number | null }`
  - `type SignalLite = { strategy: string; entry: number; decision: string; trade_id: string | null }`
  - `shortfall(signals: SignalLite[], fills: Map<string, { entry_price: number | null; qty: number | null; asset_class: string }>): { strategy: string; n: number; mean_bps: number; usd: number }[]`
  - `missedSignals(signals: SignalLite[]): { reason: string; n: number }[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { missedSignals, shortfall, trackingSeries, trackingStats } from "../trading/fund/tracking";

describe("live vs model", () => {
  const nav = [
    { day: "2026-09-25", equity: 100_000, by_strategy: null },
    { day: "2026-09-28", equity: 101_000, by_strategy: { CRYPTO_TREND: 600, REVERSAL: 300, MANUAL: 100 } },
    { day: "2026-09-29", equity: 100_500, by_strategy: { CRYPTO_TREND: -500, MOMENTUM: 0 } },
  ];
  const model = [
    { day: "2026-09-26", grp: "CRYPTO", day_return: 0.002 },
    { day: "2026-09-27", grp: "CRYPTO", day_return: 0.002 },
    { day: "2026-09-28", grp: "CRYPTO", day_return: 0.002 },
    { day: "2026-09-29", grp: "CRYPTO", day_return: -0.004 },
  ];
  it("compounds model days between NAV sessions (weekend crypto) and divides live group P&L by the previous equity", () => {
    const s = trackingSeries(nav, model, "CRYPTO");
    assert.equal(s.length, 2);
    assert.equal(s[0].day, "2026-09-28");
    assert.ok(Math.abs(s[0].live - 0.006) < 1e-12);
    assert.ok(Math.abs(s[0].model - (1.002 ** 3 - 1)) < 1e-12);
    assert.ok(Math.abs(s[1].live - -500 / 101_000) < 1e-12);
  });
  it("summarises cumulative difference and tracking error", () => {
    const st = trackingStats([{ day: "a", live: 0.01, model: 0.0, diff: 0.01 }, { day: "b", live: 0, model: 0.01, diff: -0.01 }]);
    assert.equal(st.days, 2);
    assert.ok(Math.abs(st.live_cum - 0.01) < 1e-12);
    assert.ok(st.te_annual !== null && Math.abs(st.te_annual - 0.01 * Math.sqrt(252)) < 1e-9);
  });
});

describe("execution quality", () => {
  const signals = [
    { strategy: "REVERSAL", entry: 100, decision: "ENTERED", trade_id: "a" },
    { strategy: "REVERSAL", entry: 50, decision: "ENTERED", trade_id: "b" },
    { strategy: "REVERSAL", entry: 20, decision: "ENTERED", trade_id: "unfilled" },
    { strategy: "MOMENTUM", entry: 10, decision: "MAX_GROSS", trade_id: null },
    { strategy: "REVERSAL", entry: 10, decision: "MAX_GROSS", trade_id: null },
    { strategy: "REVERSAL", entry: 10, decision: "ALREADY_IN_SYMBOL", trade_id: null },
  ];
  it("measures fill vs signal price per strategy", () => {
    const fills = new Map([
      ["a", { entry_price: 100.1, qty: 10, asset_class: "STOCK" }],
      ["b", { entry_price: 49.9, qty: 20, asset_class: "STOCK" }],
      ["unfilled", { entry_price: null, qty: null, asset_class: "STOCK" }],
    ]);
    const [r] = shortfall(signals, fills);
    assert.equal(r.strategy, "REVERSAL");
    assert.equal(r.n, 2);
    assert.ok(Math.abs(r.mean_bps - (10 + -20) / 2) < 1e-9);
    assert.ok(Math.abs(r.usd - (0.1 * 10 + -0.1 * 20)) < 1e-9);
  });
  it("counts blocked signals by reason", () => {
    assert.deepEqual(missedSignals(signals), [{ reason: "MAX_GROSS", n: 2 }, { reason: "ALREADY_IN_SYMBOL", n: 1 }]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test lib/__tests__/trading-fund-tracking.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Implement `lib/trading/fund/tracking.ts`**

```ts
/**
 * Live vs model, pure. Live group return on a NAV session = the group's attributed $ P&L ÷ the previous session's
 * equity; model group return = the model's daily returns compounded over the days since the previous session
 * (crypto trades weekends; NAV sessions do not). IBS_CLOSE, MANUAL and UNTRACKED have no model and are left out.
 */
export const GROUP_OF_STRATEGY: Record<string, "CRYPTO" | "STOCKS"> = {
  CRYPTO_TREND: "CRYPTO",
  MOMENTUM: "STOCKS",
  ASSET_ROTATION: "STOCKS",
  REVERSAL: "STOCKS",
  PULLBACK: "STOCKS",
};

export type NavLite = { day: string; equity: number; by_strategy: Record<string, number> | null };
export type ModelLite = { day: string; grp: string; day_return: number };
export type TrackPoint = { day: string; live: number; model: number; diff: number };

export function trackingSeries(nav: NavLite[], model: ModelLite[], grp: "CRYPTO" | "STOCKS"): TrackPoint[] {
  const m = model.filter((x) => x.grp === grp).sort((a, b) => a.day.localeCompare(b.day));
  const out: TrackPoint[] = [];
  for (let i = 1; i < nav.length; i++) {
    const prev = nav[i - 1];
    const cur = nav[i];
    if (!cur.by_strategy || !(prev.equity > 0)) continue;
    const window = m.filter((x) => x.day > prev.day && x.day <= cur.day);
    if (!window.length) continue;
    const pnl = Object.entries(cur.by_strategy).reduce((s, [k, v]) => s + (GROUP_OF_STRATEGY[k] === grp ? v : 0), 0);
    const live = pnl / prev.equity;
    const modelRet = window.reduce((p, x) => p * (1 + x.day_return), 1) - 1;
    out.push({ day: cur.day, live, model: modelRet, diff: live - modelRet });
  }
  return out;
}

export function trackingStats(series: TrackPoint[], window = 20): { days: number; live_cum: number; model_cum: number; diff_cum: number; te_annual: number | null } {
  const s = series.slice(-window);
  const cum = (k: "live" | "model") => s.reduce((p, x) => p * (1 + x[k]), 1) - 1;
  const d = s.map((x) => x.diff);
  const mean = d.reduce((a, b) => a + b, 0) / Math.max(1, d.length);
  const sd = d.length > 1 ? Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length) : null;
  const live_cum = cum("live");
  const model_cum = cum("model");
  return { days: s.length, live_cum, model_cum, diff_cum: live_cum - model_cum, te_annual: sd === null ? null : sd * Math.sqrt(252) };
}

export type SignalLite = { strategy: string; entry: number; decision: string; trade_id: string | null };

/**
 * Fill vs the signal's reference price, per strategy. Stocks signal at the close and fill at the next open, so
 * this includes the overnight gap — noise per trade, near zero on average; the research assumes the same timing.
 */
export function shortfall(signals: SignalLite[], fills: Map<string, { entry_price: number | null; qty: number | null; asset_class: string }>): { strategy: string; n: number; mean_bps: number; usd: number }[] {
  const by = new Map<string, { n: number; bps: number; usd: number }>();
  for (const s of signals) {
    if (s.decision !== "ENTERED" || !s.trade_id || !(s.entry > 0)) continue;
    const f = fills.get(s.trade_id);
    if (!f || f.entry_price === null || !(f.entry_price > 0)) continue;
    const g = by.get(s.strategy) ?? { n: 0, bps: 0, usd: 0 };
    g.n += 1;
    g.bps += ((f.entry_price - s.entry) / s.entry) * 10_000;
    g.usd += (f.entry_price - s.entry) * (f.qty ?? 0);
    by.set(s.strategy, g);
  }
  return [...by.entries()].map(([strategy, g]) => ({ strategy, n: g.n, mean_bps: g.bps / g.n, usd: g.usd })).sort((a, b) => b.n - a.n);
}

export function missedSignals(signals: SignalLite[]): { reason: string; n: number }[] {
  const by = new Map<string, number>();
  for (const s of signals) if (s.decision !== "ENTERED") by.set(s.decision, (by.get(s.decision) ?? 0) + 1);
  return [...by.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n || a.reason.localeCompare(b.reason));
}
```

- [ ] **Step 4: Run the tests, bump, verify, PR B, merge**

Run: `node --import tsx --test lib/__tests__/trading-fund-tracking.test.ts` → PASS. Version → `2.17.0`.
Run `npm run verify` → green. Commit `feat(trading): model book + tracking (2.17.0)`, push a branch, open PR
"Trading fund-grade 2/6", squash-merge. After the next pass, `trading_model_book` has a row per group with a
`duration_ms` (expected < 20 000; if higher, lower `MODEL_WINDOW_DAYS` to 150 in a follow-up patch).

---

### Task 8: Health monitor (PR C)

**Files:**
- Create: `lib/trading/fund/health-core.ts`
- Create: `lib/trading/fund/health.ts`
- Modify: `lib/trading/engine.ts` (end of `runTick`), `lib/trading/intraday-engine.ts` (end of `runIntradayTick`)
- Modify: `lib/trading/store.ts` (`TradingSettings.health`), `lib/trading/types-client.ts` (`health` on settings)
- Test: `lib/__tests__/trading-fund-health.test.ts`
- Modify: `package.json` (2.18.0)

**Interfaces:**
- Produces:
  - `type HealthLevel = "ok" | "warn" | "critical"`
  - `type HealthCheck = { id: HealthCheckId; level: HealthLevel; message: string; subjects: string[] }`
  - `type HealthReport = { status: HealthLevel; checked_at: string; source: "main" | "intraday"; checks: HealthCheck[] }`
  - `type HealthSnapshot`
  - `evaluateHealth(s: HealthSnapshot): HealthReport`
  - `alertsToSend(prev: HealthReport | null, next: HealthReport, reported: Map<string, Set<string>>): { raise: { id: string; subject: string; message: string }[]; resolved: string[] }`
  - `runHealthChecks(now: number, source: "main" | "intraday", errors: string[]): Promise<HealthReport | null>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertsToSend, evaluateHealth, type HealthSnapshot } from "../trading/fund/health-core";

const NOW = Date.parse("2026-09-30T15:00:00Z");
const base: HealthSnapshot = {
  now: NOW,
  source: "main",
  last_tick_at: new Date(NOW - 5 * 60_000).toISOString(),
  last_intraday_tick_at: new Date(NOW - 2 * 60_000).toISOString(),
  intraday_enabled: true,
  positions: [{ symbol: "NVDA", dust: false }, { symbol: "BTC", dust: false }, { symbol: "DOGE", dust: true }],
  open_sell_orders: [{ symbol: "NVDA", type: "stop" }, { symbol: "BTC", type: "stop_limit" }],
  overdue_passes: [],
  last_tick_errors: [],
  kill_switch_active: false,
};
const level = (s: HealthSnapshot, id: string) => evaluateHealth(s).checks.find((c) => c.id === id)!.level;

describe("health checks", () => {
  it("is ok when everything is fresh and protected", () => {
    assert.equal(evaluateHealth(base).status, "ok");
  });
  it("flags a position without a stop (dust ignored; a queued market sell counts)", () => {
    const s = { ...base, open_sell_orders: [{ symbol: "NVDA", type: "market" }] };
    const r = evaluateHealth(s);
    const c = r.checks.find((x) => x.id === "protective_stop")!;
    assert.equal(c.level, "critical");
    assert.deepEqual(c.subjects, ["BTC"]);
    assert.equal(r.status, "critical");
  });
  it("a take-profit limit alone is not protection", () => {
    assert.equal(level({ ...base, open_sell_orders: [{ symbol: "NVDA", type: "stop" }, { symbol: "BTC", type: "limit" }] }, "protective_stop"), "critical");
  });
  it("each tick watches the other's heartbeat", () => {
    assert.equal(level({ ...base, source: "intraday", last_tick_at: new Date(NOW - 41 * 60_000).toISOString() }, "main_heartbeat"), "critical");
    assert.equal(level({ ...base, last_intraday_tick_at: new Date(NOW - 21 * 60_000).toISOString() }, "intraday_heartbeat"), "critical");
    assert.equal(level({ ...base, intraday_enabled: false, last_intraday_tick_at: null }, "intraday_heartbeat"), "ok");
  });
  it("overdue book passes, tick errors and the kill switch", () => {
    assert.equal(level({ ...base, overdue_passes: ["STOCKS 2026-09-29"] }, "book_pass"), "critical");
    assert.equal(level({ ...base, last_tick_errors: ["book: enter X: alpaca_403 insufficient"] }, "tick_errors"), "warn");
    assert.equal(level({ ...base, kill_switch_active: true }, "kill_switch"), "critical");
  });
});

describe("alerts", () => {
  it("raises each new critical subject once a day and reports recoveries", () => {
    const bad = evaluateHealth({ ...base, open_sell_orders: [{ symbol: "NVDA", type: "stop" }] });
    const a = alertsToSend(null, bad, new Map());
    assert.deepEqual(a.raise.map((x) => [x.id, x.subject]), [["protective_stop", "BTC"]]);
    const again = alertsToSend(bad, bad, new Map([["protective_stop", new Set(["BTC"])]]));
    assert.equal(again.raise.length, 0);
    const fixed = alertsToSend(bad, evaluateHealth(base), new Map());
    assert.deepEqual(fixed.resolved, ["protective_stop"]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test lib/__tests__/trading-fund-health.test.ts`
Expected: FAIL, module not found

- [ ] **Step 3: Implement `lib/trading/fund/health-core.ts`**

```ts
export type HealthLevel = "ok" | "warn" | "critical";
export type HealthCheckId = "main_heartbeat" | "intraday_heartbeat" | "protective_stop" | "book_pass" | "tick_errors" | "kill_switch";
export type HealthCheck = { id: HealthCheckId; level: HealthLevel; message: string; subjects: string[] };
export type HealthReport = { status: HealthLevel; checked_at: string; source: "main" | "intraday"; checks: HealthCheck[] };

export type HealthSnapshot = {
  now: number;
  source: "main" | "intraday";
  last_tick_at: string | null;
  last_intraday_tick_at: string | null;
  intraday_enabled: boolean;
  /** Broker positions, our symbol form (BTC, not BTCUSD). */
  positions: { symbol: string; dust: boolean }[];
  /** Open sell orders (legs listed on their own), our symbol form. */
  open_sell_orders: { symbol: string; type: string }[];
  /** Book passes due for more than the grace period, e.g. "STOCKS 2026-09-29". */
  overdue_passes: string[];
  last_tick_errors: string[];
  kill_switch_active: boolean;
};

export const MAIN_TICK_STALE_MS = 40 * 60_000;
export const INTRADAY_TICK_STALE_MS = 20 * 60_000;
/** A resting stop, or an exit already queued at market (a stock exit waits for the open). A limit alone is not protection. */
const PROTECTIVE_TYPES = new Set(["stop", "stop_limit", "trailing_stop", "market"]);
const RANK: Record<HealthLevel, number> = { ok: 0, warn: 1, critical: 2 };

const ageMs = (iso: string | null, now: number) => (iso ? now - Date.parse(iso) : Infinity);
const mins = (ms: number) => (Number.isFinite(ms) ? `${Math.round(ms / 60_000)} דק׳` : "אף פעם");

export function evaluateHealth(s: HealthSnapshot): HealthReport {
  const checks: HealthCheck[] = [];
  const mainAge = ageMs(s.last_tick_at, s.now);
  checks.push(
    s.source === "intraday" && mainAge > MAIN_TICK_STALE_MS
      ? { id: "main_heartbeat", level: "critical", message: `ה-tick הראשי לא רץ ${mins(mainAge)}`, subjects: [] }
      : { id: "main_heartbeat", level: "ok", message: "", subjects: [] }
  );
  const intraAge = ageMs(s.last_intraday_tick_at, s.now);
  checks.push(
    s.source === "main" && s.intraday_enabled && intraAge > INTRADAY_TICK_STALE_MS
      ? { id: "intraday_heartbeat", level: "critical", message: `ה-tick התוך-יומי לא רץ ${mins(intraAge)}`, subjects: [] }
      : { id: "intraday_heartbeat", level: "ok", message: "", subjects: [] }
  );
  const covered = new Set(s.open_sell_orders.filter((o) => PROTECTIVE_TYPES.has(o.type)).map((o) => o.symbol));
  const naked = s.positions.filter((p) => !p.dust && !covered.has(p.symbol)).map((p) => p.symbol).sort();
  checks.push({ id: "protective_stop", level: naked.length ? "critical" : "ok", message: naked.length ? `פוזיציות בלי סטופ אצל הברוקר: ${naked.join(", ")}` : "", subjects: naked });
  checks.push({ id: "book_pass", level: s.overdue_passes.length ? "critical" : "ok", message: s.overdue_passes.length ? `מעבר ספר באיחור: ${s.overdue_passes.join(", ")}` : "", subjects: s.overdue_passes });
  checks.push({ id: "tick_errors", level: s.last_tick_errors.length ? "warn" : "ok", message: s.last_tick_errors.slice(0, 3).join(" | ").slice(0, 300), subjects: [] });
  checks.push({ id: "kill_switch", level: s.kill_switch_active ? "critical" : "ok", message: s.kill_switch_active ? "מתג הכיבוי פעיל — אין כניסות חדשות" : "", subjects: [] });
  const status = checks.reduce<HealthLevel>((w, c) => (RANK[c.level] > RANK[w] ? c.level : w), "ok");
  return { status, checked_at: new Date(s.now).toISOString(), source: s.source, checks };
}

/** Critical subjects not yet reported today, and checks that were critical and are ok now. */
export function alertsToSend(prev: HealthReport | null, next: HealthReport, reported: Map<string, Set<string>>): { raise: { id: string; subject: string; message: string }[]; resolved: string[] } {
  const raise: { id: string; subject: string; message: string }[] = [];
  for (const c of next.checks) {
    if (c.level !== "critical") continue;
    for (const subject of c.subjects.length ? c.subjects : ["_"]) {
      if (!reported.get(c.id)?.has(subject)) raise.push({ id: c.id, subject, message: c.message });
    }
  }
  const resolved = (prev?.checks ?? []).filter((c) => c.level === "critical" && next.checks.find((n) => n.id === c.id)?.level === "ok").map((c) => c.id);
  return { raise, resolved };
}
```

Note: heartbeats compare against the *other* tick only, because a tick evaluating its own freshness always
reads fresh. The `alertsToSend` test's `resolved` case needs both reports to have the same `source`, and `base`
has `source: "main"`, so the `main_heartbeat` check is ok in both.

- [ ] **Step 4: Implement `lib/trading/fund/health.ts`**

```ts
import { getSupabase } from "@/lib/supabase";
import { alpaca, ensureProtectiveStop, fromAlpacaPositionSymbol, isAlpacaConfigured, isDustPosition } from "../broker/alpaca";
import { duePasses, type BookState } from "../book/engine";
import { getOpenTrades, getSettings, logEvent, symbolsLoggedOn } from "../store";
import { alertsToSend, evaluateHealth, type HealthReport } from "./health-core";

const D1 = 86_400_000;
/** A pass is overdue this long after its bar could first be processed (crypto 00:00 UTC; stocks ~21:20 UTC at the latest). */
const PASS_GRACE_MS = 3 * 3_600_000;

function passDueAt(group: string, bar: string): number {
  const t = Date.parse(`${bar}T00:00:00Z`);
  return group === "CRYPTO" ? t + D1 : t + 21 * 3_600_000 + 20 * 60_000;
}

/**
 * Gather the snapshot, repair unprotected positions (main tick only — the mirror of the same tick already ran),
 * evaluate, store the report in trading_settings.health, push new critical alerts and recoveries.
 */
export async function runHealthChecks(now: number, source: "main" | "intraday", errors: string[]): Promise<HealthReport | null> {
  if (!isAlpacaConfigured()) return null;
  try {
    const settings = await getSettings();
    const [positions, orders] = await Promise.all([alpaca.positions(), alpaca.allOpenOrders()]);
    const sells = orders.filter((o) => o.side === "sell").map((o) => ({ symbol: fromAlpacaPositionSymbol(o.symbol), type: o.type }));
    const pos = positions.map((p) => ({ symbol: fromAlpacaPositionSymbol(p.symbol), dust: isDustPosition(p), qty: Number(p.qty) }));

    if (source === "main") {
      const covered = new Set(sells.filter((o) => ["stop", "stop_limit", "trailing_stop", "market"].includes(o.type)).map((o) => o.symbol));
      const naked = pos.filter((p) => !p.dust && !covered.has(p.symbol));
      if (naked.length) {
        const open = await getOpenTrades();
        for (const p of naked) {
          const t = open.find((x) => x.symbol === p.symbol && x.broker);
          const stop = t ? Number(t.stop_price ?? t.sim_state?.stop_price) : NaN;
          if (!t || !(stop > 0)) continue;
          const placed = await ensureProtectiveStop({ tradeId: t.id, symbol: t.symbol, assetClass: t.asset_class, qty: p.qty, stop, now }).catch(() => null);
          if (placed) {
            sells.push({ symbol: p.symbol, type: placed.type });
            await logEvent({ kind: "HEALTH_STOP_REPAIRED", symbol: p.symbol, severity: "warn", message: `הונח סטופ חסר ל-${p.symbol} ב-${stop}`, push: true });
          }
        }
      }
    }

    const state = (settings.book_state ?? {}) as BookState;
    const overdue = (await duePasses(state, now)).filter((d) => now - passDueAt(d.group, d.bar) > PASS_GRACE_MS).map((d) => `${d.group} ${d.bar}`);
    const tickErrors = ((settings.last_tick_summary?.errors as string[] | undefined) ?? []).filter((e) => !e.startsWith("model_"));

    const report = evaluateHealth({
      now,
      source,
      last_tick_at: settings.last_tick_at,
      last_intraday_tick_at: settings.last_intraday_tick_at,
      intraday_enabled: settings.intraday_enabled,
      positions: pos,
      open_sell_orders: sells,
      overdue_passes: overdue,
      last_tick_errors: tickErrors,
      kill_switch_active: settings.kill_switch_active,
    });

    const day = new Date(now).toISOString().slice(0, 10);
    const critical = report.checks.filter((c) => c.level === "critical");
    const reported = new Map<string, Set<string>>();
    for (const c of critical) reported.set(c.id, new Set(await symbolsLoggedOn(`HEALTH_${c.id.toUpperCase()}`, day)));
    const prev = (settings.health ?? null) as HealthReport | null;
    const { raise, resolved } = alertsToSend(prev && prev.source === source ? prev : null, report, reported);
    for (const a of raise) {
      await logEvent({ kind: `HEALTH_${a.id.toUpperCase()}`, symbol: a.subject, severity: "critical", message: a.message, push: true });
    }
    for (const id of resolved) await logEvent({ kind: "HEALTH_RESOLVED", severity: "info", message: `תקין שוב: ${id}`, push: true });

    await getSupabase().from("trading_settings").update({ health: report }).eq("id", true);
    return report;
  } catch (err) {
    errors.push(`health: ${err instanceof Error ? err.message.slice(0, 120) : "?"}`);
    return null;
  }
}
```

Settings types: add `health: Record<string, unknown> | null;` to `TradingSettings` in `lib/trading/store.ts`,
and `health: (r.health as Record<string, unknown>) ?? null,` in `getSettings`. In `types-client.ts`, add
`health: HealthReport | null;` to `TradingSettings` and re-export the type:
`export type { HealthReport, HealthCheck, HealthLevel } from "./fund/health-core";`. `health-core.ts` has no
server imports, so this is client-safe.

`duePasses` is exported from `book/engine.ts` already. Check that `BookState` is exported (it is).

- [ ] **Step 5: Wire into both ticks**

`lib/trading/engine.ts`, just before `summary.duration_ms = Date.now() - started;`:

```ts
  await runHealthChecks(now, "main", summary.errors);
```

`lib/trading/intraday-engine.ts`, inside the `finally`, before the `trading_settings` update that writes
`last_intraday_tick_at`:

```ts
    await runHealthChecks(now, "intraday", summary.errors).catch(() => null);
```

(with `import { runHealthChecks } from "./fund/health";` in both files). Health runs *after* the mirror and
reconcile of its own tick, so a stop that the mirror is about to place is already there.

- [ ] **Step 6: Tests, verify, PR C, merge, verify in production**

Run: `node --import tsx --test lib/__tests__/trading-fund-health.test.ts` → PASS. Version → `2.18.0`.
`npm run verify` → green. Commit, push, PR "Trading fund-grade 3/6: health monitor + alerts", squash-merge.
After deploy: `select health from myself.trading_settings` shows `status: "ok"` with all six checks (or a real
problem that must be investigated before moving on).

---

### Task 9: Fund view API (first half of PR D)

**Files:**
- Create: `lib/trading/service-fund.ts`
- Create: `app/api/v1/trading/fund/route.ts`
- Modify: `lib/trading/types-client.ts` (`FundView`)
- Test: `lib/__tests__/trading-fund-view.test.ts`

**Interfaces:**
- Consumes: `trackingSeries`, `trackingStats`, `shortfall`, `missedSignals` (Task 7), `BOOK_INCEPTION` (Task 4), `HealthReport` (Task 8)
- Produces: `type FundView` (below), `buildFundView(input): FundView` (pure), `getFundView(): Promise<FundView>`

- [ ] **Step 1: Types in `lib/trading/types-client.ts`**

```ts
export type FundAttribution = { strategy: string; mtd_usd: number; mtd_pct: number; itd_usd: number; itd_pct: number };
export type FundTracking = {
  grp: "CRYPTO" | "STOCKS";
  series: { day: string; live: number; model: number; diff: number }[];
  stats: { days: number; live_cum: number; model_cum: number; diff_cum: number; te_annual: number | null };
};
export type FundView = {
  inception: string;
  as_of: string | null;
  equity: number | null;
  /** Rebased to 100 at inception. */
  nav: { day: string; index: number; model: number | null }[];
  itd_return: number | null;
  mtd_return: number | null;
  drawdown: number | null;
  max_drawdown: number | null;
  attribution: FundAttribution[];
  unattributed_itd: number;
  tracking: FundTracking[];
  shortfall: { strategy: string; n: number; mean_bps: number; usd: number }[];
  missed: { reason: string; n: number }[];
  health: HealthReport | null;
};
```

- [ ] **Step 2: Write the failing test for the pure builder**

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFundView } from "../trading/service-fund";

const nav = [
  { day: "2026-09-26", equity: 100_000, pnl: 0, twr_return: 0, nav_index: 110, peak_index: 120, drawdown: 0.083, by_strategy: null, unattributed: null },
  { day: "2026-09-29", equity: 101_000, pnl: 1_000, twr_return: 0.01, nav_index: 111.1, peak_index: 120, drawdown: 0.074, by_strategy: { REVERSAL: 800, CRYPTO_TREND: 150 }, unattributed: 50 },
  { day: "2026-10-01", equity: 100_495, pnl: -505, twr_return: -0.005, nav_index: 110.5445, peak_index: 120, drawdown: 0.079, by_strategy: { REVERSAL: -505 }, unattributed: 0 },
];

describe("fund view", () => {
  it("rebases NAV to inception, splits MTD from ITD and ranks attribution", () => {
    const v = buildFundView({ nav, model: [], signals: [], fills: new Map(), health: null, inception: "2026-09-28" });
    assert.deepEqual(v.nav.map((x) => x.day), ["2026-09-29", "2026-10-01"]);
    assert.ok(Math.abs(v.nav[0].index - 101) < 1e-9);
    assert.ok(Math.abs((v.itd_return ?? 0) - (1.01 * 0.995 - 1)) < 1e-9);
    assert.ok(Math.abs((v.mtd_return ?? 0) - -0.005) < 1e-9);
    assert.equal(v.attribution[0].strategy, "REVERSAL");
    assert.equal(v.attribution[0].itd_usd, 295);
    assert.equal(v.attribution[0].mtd_usd, -505);
    assert.equal(v.unattributed_itd, 50);
    assert.equal(v.equity, 100_495);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `node --import tsx --test lib/__tests__/trading-fund-view.test.ts`
Expected: FAIL, module not found

- [ ] **Step 4: Implement `lib/trading/service-fund.ts`**

```ts
import { getSupabase } from "@/lib/supabase";
import { BOOK_INCEPTION } from "./fund/nav-core";
import type { HealthReport } from "./fund/health-core";
import { missedSignals, shortfall, trackingSeries, trackingStats, type ModelLite, type SignalLite } from "./fund/tracking";
import type { FundView } from "./types-client";

type NavDb = { day: string; equity: number; pnl: number; twr_return: number; nav_index: number; peak_index: number; drawdown: number; by_strategy: Record<string, number> | null; unattributed: number | null };

export function buildFundView(input: { nav: NavDb[]; model: ModelLite[]; signals: SignalLite[]; fills: Map<string, { entry_price: number | null; qty: number | null; asset_class: string }>; health: HealthReport | null; inception: string }): FundView {
  const all = input.nav;
  const since = all.filter((r) => r.day >= input.inception);
  const month = since.length ? since[since.length - 1].day.slice(0, 7) : "";
  const chain = (rows: NavDb[]) => (rows.length ? rows.reduce((p, r) => p * (1 + r.twr_return), 1) - 1 : null);

  // Model NAV: both groups' daily returns summed per NAV session (each is a return on the whole equity).
  const trackingCrypto = trackingSeries(all, input.model, "CRYPTO");
  const trackingStocks = trackingSeries(all, input.model, "STOCKS");
  const modelDay = new Map<string, number>();
  for (const p of [...trackingCrypto, ...trackingStocks]) modelDay.set(p.day, (modelDay.get(p.day) ?? 0) + p.model);

  let idx = 100;
  let midx = 100;
  let peak = 100;
  let maxDd = 0;
  const nav = since.map((r) => {
    idx *= 1 + r.twr_return;
    const m = modelDay.get(r.day);
    if (m !== undefined) midx *= 1 + m;
    peak = Math.max(peak, idx);
    maxDd = Math.max(maxDd, 1 - idx / peak);
    return { day: r.day, index: idx, model: modelDay.size ? midx : null };
  });

  const attr = new Map<string, { mtd_usd: number; mtd_pct: number; itd_usd: number; itd_pct: number }>();
  let unattributed = 0;
  since.forEach((r) => {
    const i = all.indexOf(r);
    const prevEq = i > 0 ? all[i - 1].equity : r.equity;
    unattributed += r.unattributed ?? 0;
    for (const [k, v] of Object.entries(r.by_strategy ?? {})) {
      const a = attr.get(k) ?? { mtd_usd: 0, mtd_pct: 0, itd_usd: 0, itd_pct: 0 };
      a.itd_usd += v;
      a.itd_pct += prevEq > 0 ? v / prevEq : 0;
      if (r.day.startsWith(month)) {
        a.mtd_usd += v;
        a.mtd_pct += prevEq > 0 ? v / prevEq : 0;
      }
      attr.set(k, a);
    }
  });
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const last = since[since.length - 1] ?? null;
  return {
    inception: input.inception,
    as_of: last?.day ?? null,
    equity: last ? Number(last.equity) : null,
    nav,
    itd_return: chain(since),
    mtd_return: chain(since.filter((r) => r.day.startsWith(month))),
    drawdown: nav.length ? 1 - idx / peak : null,
    max_drawdown: nav.length ? maxDd : null,
    attribution: [...attr.entries()].map(([strategy, a]) => ({ strategy, mtd_usd: r2(a.mtd_usd), mtd_pct: a.mtd_pct, itd_usd: r2(a.itd_usd), itd_pct: a.itd_pct })).sort((a, b) => Math.abs(b.itd_usd) - Math.abs(a.itd_usd)),
    unattributed_itd: r2(unattributed),
    tracking: [
      { grp: "CRYPTO", series: trackingCrypto, stats: trackingStats(trackingCrypto) },
      { grp: "STOCKS", series: trackingStocks, stats: trackingStats(trackingStocks) },
    ],
    shortfall: shortfall(input.signals, input.fills),
    missed: missedSignals(input.signals),
    health: input.health,
  };
}

export async function getFundView(): Promise<FundView> {
  const db = getSupabase();
  const [navRes, modelRes, sigRes, setRes] = await Promise.all([
    db.from("trading_nav_daily").select("day, equity, pnl, twr_return, nav_index, peak_index, drawdown, by_strategy, unattributed").order("day", { ascending: true }).limit(1000),
    db.from("trading_model_book").select("day, grp, day_return").order("day", { ascending: true }).limit(5000),
    db.from("trading_book_signals").select("strategy, entry, decision, trade_id").gte("bar", BOOK_INCEPTION).limit(20000),
    db.from("trading_settings").select("health").eq("id", true).maybeSingle(),
  ]);
  for (const r of [navRes, modelRes, sigRes, setRes]) if (r.error) throw new Error(`fund: ${r.error.message}`);
  const signals = (sigRes.data ?? []).map((s) => ({ strategy: String(s.strategy), entry: Number(s.entry), decision: String(s.decision), trade_id: (s.trade_id as string) ?? null }));
  const ids = [...new Set(signals.map((s) => s.trade_id).filter((x): x is string => Boolean(x)))];
  const fills = new Map<string, { entry_price: number | null; qty: number | null; asset_class: string }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("trading_trades").select("id, entry_price, broker_filled_qty, asset_class").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(`fund fills: ${error.message}`);
    for (const t of data ?? []) fills.set(String(t.id), { entry_price: t.entry_price === null ? null : Number(t.entry_price), qty: t.broker_filled_qty === null ? null : Number(t.broker_filled_qty), asset_class: String(t.asset_class) });
  }
  const nav = (navRes.data ?? []).map((r) => ({ ...r, equity: Number(r.equity), pnl: Number(r.pnl), unattributed: r.unattributed === null ? null : Number(r.unattributed) })) as NavDb[];
  return buildFundView({ nav, model: (modelRes.data ?? []) as ModelLite[], signals, fills, health: (setRes.data?.health as HealthReport) ?? null, inception: BOOK_INCEPTION });
}
```

- [ ] **Step 5: Route `app/api/v1/trading/fund/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { denyUnlessPrimary } from "@/lib/api/auth";
import { getFundView } from "@/lib/trading/service-fund";
import { withRouteHandler } from "@/lib/api/with-route-handler";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export const GET = withRouteHandler(async function GET(req: NextRequest) {
  const denied = await denyUnlessPrimary(req);
  if (denied) return denied;
  try {
    return NextResponse.json(await getFundView(), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "fund_failed" }, { status: 500 });
  }
});
```

- [ ] **Step 6: Tests, commit**

Run: `node --import tsx --test lib/__tests__/trading-fund-view.test.ts && npx tsc --noEmit -p tsconfig.json` → PASS

```bash
git add lib/trading/service-fund.ts app/api/v1/trading/fund/route.ts lib/trading/types-client.ts lib/__tests__/trading-fund-view.test.ts
git commit -m "feat(trading): fund view API"
```

---

### Task 10: Fund card + screen (end of PR D)

**Files:**
- Modify: `mobile/src/api/resources.ts` (`tradingFund`), `mobile/src/query/keys.ts` (`tradingFund`)
- Create: `mobile/src/components/trading/fund.tsx`
- Create: `mobile/app/trading-fund.tsx`
- Modify: `mobile/app/(tabs)/trading.tsx` (card at the top), `mobile/src/components/trading/blocks.tsx` (hub link)
- Modify: `lib/i18n/messages.ts` (he + en `trading.fund.*`)
- Modify: `package.json` (2.19.0)

- [ ] **Step 1: Client and query key**

`resources.ts`, next to `tradingDashboard`:
`tradingFund: (c: ApiConfig) => apiFetch<FundView>(c, "/trading/fund"),` (import `FundView` from
`@/lib/trading/types-client`, the same way the file imports `DashboardOverview`).
`keys.ts`, next to `tradingDashboard`: `tradingFund: ["trading", "fund"] as const,`.

- [ ] **Step 2: i18n** — in the Hebrew `trading` block of `lib/i18n/messages.ts` add:

```ts
      hubFund: "קרן",
      fund: {
        title: "הקרן",
        subtitle: "תשואה מאז תחילת הספר ({date}) · מקור: הברוקר",
        itd: "מאז ההתחלה",
        mtd: "החודש",
        drawdown: "ירידה מהשיא",
        maxDrawdown: "ירידה מקסימלית",
        vsModel: "חי מול מודל (20 יום)",
        health: "מצב המערכת",
        healthOk: "תקין",
        healthWarn: "אזהרה",
        healthCritical: "תקלה",
        navChart: "NAV (100 = התחלה)",
        modelChart: "מודל המחקר על אותו יקום",
        attribution: "רווח לפי אסטרטגיה",
        unattributed: "לא מיוחס (עמלות, אבק, תזמון)",
        tracking: "מעקב מול המודל",
        teAnnual: "סטיית מעקב שנתית",
        shortfall: "עלות ביצוע מול מחיר הסיגנל",
        missed: "סיגנלים שלא נכנסו",
        empty: "הנתונים יתחילו להצטבר אחרי ה-tick הבא",
        open: "לפרטי הקרן",
      },
```

and the English block the same keys: `hubFund: "Fund"`, `title: "Fund"`,
`subtitle: "Return since the book started ({date}) · source: broker"`, `itd: "Since start"`,
`mtd: "This month"`, `drawdown: "Drawdown"`, `maxDrawdown: "Max drawdown"`,
`vsModel: "Live vs model (20d)"`, `health: "System health"`, `healthOk: "OK"`, `healthWarn: "Warning"`,
`healthCritical: "Problem"`, `navChart: "NAV (100 = start)"`,
`modelChart: "Research model on the same universe"`, `attribution: "P&L by strategy"`,
`unattributed: "Unattributed (fees, dust, timing)"`, `tracking: "Tracking vs model"`,
`teAnnual: "Annual tracking error"`, `shortfall: "Execution cost vs signal price"`,
`missed: "Signals not entered"`, `empty: "Data starts after the next tick"`, `open: "Fund details"`.

Check how `t()` interpolates (`grep -n "{date}\|interpolate" mobile/src/i18n.tsx`) and use that mechanism
for `subtitle`.

- [ ] **Step 3: `mobile/src/components/trading/fund.tsx`**

```tsx
import React from "react";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FundView, HealthReport } from "@/lib/trading/types-client";
import { fmtPct } from "@/lib/trading/format";
import { useI18n } from "../../i18n";
import { useLayoutDir } from "../../layout-dir";
import { useColors, tokens } from "../../theme";
import { Btn, Card } from "../ui";
import { KpiGrid } from "./charts";

export function HealthBadge({ health }: { health: HealthReport | null }) {
  const c = useColors();
  const { t } = useI18n();
  const { row, textStart } = useLayoutDir();
  const status = health?.status ?? "ok";
  const color = status === "critical" ? c.bad ?? c.warn : status === "warn" ? c.warn : c.good;
  const label = t(status === "critical" ? "trading.fund.healthCritical" : status === "warn" ? "trading.fund.healthWarn" : "trading.fund.healthOk");
  const problems = (health?.checks ?? []).filter((x) => x.level !== "ok");
  return (
    <View style={{ gap: 4 }}>
      <View style={{ ...row, gap: 6, alignItems: "center" }}>
        <Ionicons name={status === "ok" ? "checkmark-circle" : "alert-circle"} size={18} color={color} />
        <Text style={{ color, fontWeight: "700" }}>{`${t("trading.fund.health")}: ${label}`}</Text>
      </View>
      {problems.map((p) => (
        <Text key={p.id} style={{ color: c.muted, fontSize: tokens.textXs, textAlign: textStart }}>
          {p.message}
        </Text>
      ))}
    </View>
  );
}

export function fundKpis(v: FundView, t: (k: string) => string) {
  const track = v.tracking.map((x) => x.stats).filter((s) => s.days > 0);
  const diff = track.length ? track.reduce((s, x) => s + x.diff_cum, 0) : null;
  return [
    { label: t("trading.fund.itd"), value: v.itd_return === null ? "—" : fmtPct(v.itd_return), tone: (v.itd_return ?? 0) >= 0 ? ("good" as const) : ("warn" as const) },
    { label: t("trading.fund.mtd"), value: v.mtd_return === null ? "—" : fmtPct(v.mtd_return) },
    { label: t("trading.fund.drawdown"), value: v.drawdown === null ? "—" : fmtPct(-v.drawdown) },
    { label: t("trading.fund.vsModel"), value: diff === null ? "—" : fmtPct(diff) },
  ];
}

export function FundCard({ fund }: { fund: FundView | undefined }) {
  const { t } = useI18n();
  const router = useRouter();
  if (!fund) return null;
  return (
    <Card>
      <HealthBadge health={fund.health} />
      <View style={{ height: 8 }} />
      <KpiGrid items={fundKpis(fund, t)} />
      <Btn small variant="ghost" label={t("trading.fund.open")} onPress={() => router.push("/trading-fund")} />
    </Card>
  );
}
```

Before writing it, confirm with `grep` the exact exports and props of `Card`, `Btn` and the color token names
(`c.good`, `c.warn`, and whether `c.bad` exists) and that `fmtPct` takes a fraction. Adapt the code to what is
actually there; keep the structure.

- [ ] **Step 4: `mobile/app/trading-fund.tsx`**

```tsx
import React from "react";
import { Text, View } from "react-native";
import { Stack } from "expo-router";
import { api } from "../src/api/resources";
import { useI18n } from "../src/i18n";
import { useLayoutDir } from "../src/layout-dir";
import { useColors, tokens } from "../src/theme";
import { queryKeys, useApiQuery } from "../src/query";
import { Card, EmptyState, ErrorNote, Screen, SkeletonCard } from "../src/components/ui";
import { KpiGrid, SeriesChart } from "../src/components/trading/charts";
import { HealthBadge, fundKpis } from "../src/components/trading/fund";
import { ScreenErrorBoundary } from "../src/components/error-boundary";
import { fmtPct, fmtSignedUsd } from "@/lib/trading/format";

function Row({ label, value }: { label: string; value: string }) {
  const c = useColors();
  const { row, textStart } = useLayoutDir();
  return (
    <View style={{ ...row, justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: c.ink, textAlign: textStart }}>{label}</Text>
      <Text style={{ color: c.ink, fontWeight: "700", writingDirection: "ltr" }}>{value}</Text>
    </View>
  );
}

function FundScreen() {
  const { t } = useI18n();
  const c = useColors();
  const q = useApiQuery(queryKeys.tradingFund, (cfg) => api.tradingFund(cfg), { staleTime: 60_000 });
  const v = q.data;
  return (
    <Screen refreshing={q.isFetching} onRefresh={() => void q.refresh()}>
      <Stack.Screen options={{ title: t("trading.fund.title") }} />
      {q.error ? <ErrorNote error={q.error} /> : null}
      {!v ? (
        <SkeletonCard />
      ) : !v.nav.length ? (
        <EmptyState title={t("trading.fund.empty")} />
      ) : (
        <View style={{ gap: 12 }}>
          <Card>
            <HealthBadge health={v.health} />
          </Card>
          <Card>
            <KpiGrid items={[...fundKpis(v, t), { label: t("trading.fund.maxDrawdown"), value: v.max_drawdown === null ? "—" : fmtPct(-v.max_drawdown) }]} />
            <SeriesChart title={t("trading.fund.navChart")} values={v.nav.map((x) => x.index)} baseline={100} format={(x) => x.toFixed(1)} />
            {v.nav.some((x) => x.model !== null) ? (
              <SeriesChart title={t("trading.fund.modelChart")} values={v.nav.map((x) => x.model ?? 100)} baseline={100} format={(x) => x.toFixed(1)} />
            ) : null}
          </Card>
          <Card>
            <Text style={{ color: c.ink, fontWeight: "800", marginBottom: 6 }}>{t("trading.fund.attribution")}</Text>
            {v.attribution.map((a) => (
              <Row key={a.strategy} label={a.strategy} value={`${fmtSignedUsd(a.itd_usd)} · ${fmtPct(a.itd_pct)}`} />
            ))}
            <Row label={t("trading.fund.unattributed")} value={fmtSignedUsd(v.unattributed_itd)} />
          </Card>
          <Card>
            <Text style={{ color: c.ink, fontWeight: "800", marginBottom: 6 }}>{t("trading.fund.tracking")}</Text>
            {v.tracking.map((tr) => (
              <Row key={tr.grp} label={tr.grp} value={tr.stats.days ? `${fmtPct(tr.stats.live_cum)} / ${fmtPct(tr.stats.model_cum)} · TE ${tr.stats.te_annual === null ? "—" : fmtPct(tr.stats.te_annual)}` : "—"} />
            ))}
          </Card>
          <Card>
            <Text style={{ color: c.ink, fontWeight: "800", marginBottom: 6 }}>{t("trading.fund.shortfall")}</Text>
            {v.shortfall.map((s) => (
              <Row key={s.strategy} label={`${s.strategy} (${s.n})`} value={`${s.mean_bps.toFixed(1)} bps · ${fmtSignedUsd(s.usd)}`} />
            ))}
          </Card>
          <Card>
            <Text style={{ color: c.ink, fontWeight: "800", marginBottom: 6 }}>{t("trading.fund.missed")}</Text>
            {v.missed.slice(0, 10).map((m) => (
              <Row key={m.reason} label={m.reason} value={String(m.n)} />
            ))}
          </Card>
          <Text style={{ color: c.muted, fontSize: tokens.textXs }}>{v.as_of ?? ""}</Text>
        </View>
      )}
    </Screen>
  );
}

export default function TradingFundRoute() {
  return (
    <ScreenErrorBoundary>
      <FundScreen />
    </ScreenErrorBoundary>
  );
}
```

Before writing it, check the props of `Screen`, `EmptyState` and `ErrorNote` and how `ScreenErrorBoundary` is
used in `mobile/app/trading-analytics.tsx`. Copy that file's screen skeleton exactly (including how it sets the
header title) and adapt the code above to it.

- [ ] **Step 5: Trading tab + hub**

`mobile/app/(tabs)/trading.tsx`:
- add `const fund = useApiQuery(queryKeys.tradingFund, (cfg) => api.tradingFund(cfg), { staleTime: 60_000 });`
- add `void fund.refresh();` inside `refresh`, and include `fund.isFetching` in `refreshing`
- render `<FundCard fund={fund.data} />` as the first card inside the screen body, above the equity section
  (import from `../../src/components/trading/fund`)

`blocks.tsx` `HUB`: add a first entry
`{ href: "/trading-fund", key: "trading.hubFund", icon: "podium-outline" as const },`.

- [ ] **Step 6: Verify, version, PR D, merge, check the web build in production**

`package.json` → `2.19.0`. `npm run verify` → green. Commit, push, PR "Trading fund-grade 4/6: fund screen",
squash-merge. After deploy, open the production web app's trading tab in the built-in browser: the fund card
shows the health badge and KPIs, and `/trading-fund` renders the charts and lists without console errors. Take a
screenshot for the report.

---

### Task 11: Risk budget (PR E)

**Files:**
- Create: `scripts/trading/risk-budget.ts`
- Modify: `lib/trading/config.ts` (`MASTER_KILL_SWITCH_DD: 0.2`)
- Modify: `lib/trading/book/close-sleeve.ts` (IBS notional × `settings.risk_scale`)
- Modify: `docs/trading/multi-strategy.md` (calibration table)
- DB: `update myself.trading_settings set risk_scale = <chosen>`
- Modify: `package.json` (2.19.1)

- [ ] **Step 1: The calibration script**

```ts
/**
 * Risk budget: the whole live book (BOOK_SLEEVES, live caps) at several risk scales, 2016-26, real costs.
 *   ETF_DIR=tmp/claude-scratch/etf-max STOCK_DIR=tmp/claude-scratch/daily-all \
 *   node --max-old-space-size=12000 --import tsx scripts/trading/risk-budget.ts
 */
import { runBook } from "../../lib/trading/strategy/multi";
import { MODEL_ENVELOPE, scaledSleeves } from "../../lib/trading/book/sleeves";
import { line, loadBook, PERIODS } from "./book-research";

const SCALES = [1, 0.85, 0.75, 0.7, 0.6, 0.5];
const assets = loadBook();
const refs = { STOCKS: assets.find((a) => a.symbol === "SPY"), CRYPTO: assets.find((a) => a.symbol === "BTC") };
for (const scale of SCALES) {
  console.log(`\n=== risk_scale ${scale}`);
  for (const [label, a, b] of PERIODS) {
    const end = Math.min(b, Date.now());
    const r = runBook({ assets, references: refs, sleeves: scaledSleeves(scale), envelope: MODEL_ENVELOPE, start: a, end, starting_equity: 100_000, stock_execution: "NEXT_OPEN" });
    console.log(line(label, r, (end - a) / (365 * 86_400_000)));
  }
}
```

If `PERIODS` or `loadBook` are not exported from `book-research.ts`, export them (the file already guards its own
main with `process.argv[1]?.endsWith("book-research.ts")`).

- [ ] **Step 2: Run it and pick the scale**

Run the command in the script header, backgrounded, with its output saved to the scratchpad.
Rule: the largest scale whose DD ≤ 15% in `train`, `valid`, `hold` *and* `ALL`. Record every scale's `ALL`
row (CAGR / Sharpe / DD) and the chosen one.

- [ ] **Step 3: Apply**

- `lib/trading/config.ts`: `MASTER_KILL_SWITCH_DD: 0.2,` with the comment updated to say 20%: the
  15% budget plus margin, down from 25% (2026-09-30).
- `close-sleeve.ts`: `const targetNotional = IBS_CLOSE_PARAMS.notional_pct * settings.risk_scale * broker.equity;`
- DB (Supabase `execute_sql`): `update myself.trading_settings set risk_scale = <chosen>, updated_at = now() where id;`
  then `logEvent`-style row: `insert into myself.trading_events(kind, message, severity) values ('RISK_SCALE', 'תקציב סיכון: ×<chosen> (יעד ירידה מקסימלית ~15%)', 'warn');`
- `docs/trading/multi-strategy.md`: a "Risk budget (2026-09-30)" section with the table and the decision.

- [ ] **Step 4: Verify, version, PR E, merge**

Check `npm run verify` and that `trading-account-envelope.test.ts` still passes (it may assert 0.25; update it to
`RISK_ENVELOPE.MASTER_KILL_SWITCH_DD` if so). Version → `2.19.1`. PR "Trading fund-grade 5/6: risk budget",
squash-merge. After deploy: `select risk_scale, kill_switch_active from myself.trading_settings` shows the new
scale and false.

---

### Task 12: Dead-code removal (PR F)

**Files:** deletions only, plus the import edits they force.

- [ ] **Step 1: Map reachability**

For each candidate module, list every importer:
`for f in lib/trading/committee lib/trading/agent-judge.ts lib/trading/agent-rater.ts lib/trading/agent-skill.ts lib/trading/learn-loop.ts lib/trading/scan-v2.ts lib/trading/intraday-scan.ts; do echo "== $f"; grep -rln "$(basename ${f%.ts})" app lib mobile/src mobile/app scripts --include='*.ts' --include='*.tsx' | grep -v "^$f"; done`

A module is removable only if every importer is itself removable, is a test of it, or imports it for a code path
behind a constant that is off in production (`V2_SCAN_ENABLED`, `INTRADAY_AUTO_ENTRIES`, committee paused). If a
live path (trading chat, search button, intraday tick for IBS/mirror, dashboard) still needs a function, keep that
module. Write the removal list with the reason for each module into the PR body.

- [ ] **Step 2: Remove in one pass, then fix the imports it breaks**

Delete the modules and their tests. Remove the dead branches in the callers (`if (V2_SCAN_ENABLED) …`, committee
hook calls, agent rating calls in paths that no longer run). Leave the DB tables alone.

- [ ] **Step 3: Verify**

`npm run verify` → green. `wc -l` of `lib/trading` before and after goes in the PR body.

- [ ] **Step 4: Version, PR F, merge, and one clean production tick**

Version → `2.19.2`. PR "Trading fund-grade 6/6: remove unreachable AI/intraday-entry code", squash-merge. After
deploy, wait for one main tick and one intraday tick: `last_tick_summary.errors` and
`last_intraday_summary.errors` are empty (or show only pre-existing issues), and `health.status` is `ok`.
