# מערכת המסחר, ברמת קרן: שלב 1 (חוסן + מדידה)

Date: 2026-09-30 · Status: approved in chat, building

## Why

The user wants to turn the deterministic multi-strategy book into an algo-trading business that will one day trade
their own capital (prop). Real money comes last. Until then everything runs on the Alpaca demo account, and every
new part plugs into the existing platform: `lib/trading/**`, `app/api/**`, Supabase `myself.*`, pg_cron, and the
Expo trading tab.

What a fund needs and the system lacks today:

1. **There is no account-level performance record.** `trading_equity_snapshots` holds one equity number per day,
   written at whatever time the tick ran. It has no cash-flow separation, no time-weighted return and no per-strategy
   attribution. Aggregates are sums of R, and summing R is meaningless across trades whose risk runs from $0.41 to
   $460: one BCH partial fill booked +37R on $14.83.
2. **There is no proof that live execution matches the research.** The book (live since 2026-09-28) comes from a
   10-year backtest (CAGR 24%, Sharpe 1.22, DD 21%, inflated by survivorship). Nothing compares what the model
   would hold with what the account holds, what fills cost against the planned price, or which signals were blocked
   and why. `BookPassSummary.blocked` only counts reasons.
3. **Failures stay silent.** A dead tick, a position without a protective stop, or broker/DB drift is found only
   when someone looks. (The 2026-09-22 unprotected crypto positions sat for hours.)
4. **The risk budget has no stated target.** The user delegated it: see §5.

## Scope of phase 1

| # | Unit | New / changed |
|---|---|---|
| 1 | Signal log | new table `trading_book_signals`; written by `runBookPass` |
| 2 | NAV ledger + attribution | new `lib/trading/fund/nav.ts`, table `trading_nav_daily` |
| 3 | Model book (shadow) + tracking | new `lib/trading/fund/model-book.ts`, `lib/trading/fund/tracking.ts`, table `trading_model_book` |
| 4 | Health monitor + alerts | new `lib/trading/fund/health.ts`; runs at the end of both ticks |
| 5 | Risk budget | `risk_scale` calibration, `MASTER_KILL_SWITCH_DD` 0.25 → 0.20 |
| 6 | Dead-code removal | AI committee / agent / intraday-entry code that production no longer reaches |
| 7 | Fund screen | trading tab: NAV, attribution, live vs model, health |

Out of scope, later phases: survivorship-free data (paid vendor, the user decides), cross-sleeve risk allocation
research, new sleeves, capital-adaptive slots, the real-money go-live checklist and account switch.

## 1. Signal log

Today `runBookPass` scans, filters and enters, and keeps nothing but counts. From now on every signal of every pass
becomes one row:

`trading_book_signals(id, bar date, grp, strategy, symbol, score, entry, stop, target, planned_size, planned_risk_usd,
decision text, trade_id uuid null, created_at)`, unique `(bar, strategy, symbol)`.

`decision` holds `ENTERED` or the block reason already used in the loop (`ALREADY_IN_SYMBOL`, `MAX_<SLEEVE>`,
`MAX_BOOK`, `MAX_GROSS`, `SIZE`, guard reasons, `KILL_SWITCH`, `TIME_BUDGET`, …). Signals are collected in memory
and inserted in one upsert at the end of the pass. A failed insert only adds an error; it never blocks trading.
The IBS_CLOSE pass in `close-sleeve.ts` logs the same way.

This is the raw material for implementation shortfall (planned `entry` vs the fill VWAP settled from broker fills)
and for missed-signal analysis.

## 2. NAV ledger and attribution

`trading_nav_daily(day pk, equity, cash_flow, pnl, twr_return, nav_index, peak_index, drawdown, by_strategy jsonb,
unattributed, source, updated_at)`.

- **Equity and cash flows come from the broker.** Alpaca `GET /v2/account/portfolio/history?period=…&timeframe=1D`
  (daily close equity) and `GET /v2/account/activities?activity_types=CSD,CSW,JNLC` (deposits and withdrawals).
  `pnl = equity − prev_equity − cash_flow`; `twr_return = pnl / prev_equity`; `nav_index` chains from 100 at
  inception. Inception is the book's first live day, 2026-09-28. Earlier days are also loaded and labelled
  pre-book, so the intraday era stays visible but is kept apart.
- **Attribution.** For each day and strategy: realized P&L of trades settled that day (`realized_pnl`, fills-based)
  plus the change in unrealized P&L of that strategy's open positions (marked to the day's close: Alpaca
  `unrealized_pl` per symbol, mapped to the trade's `setup`, with a manual trade under `manual`). Whatever does not
  sum to `pnl` goes into `unattributed` (crypto fees taken in kind, dust, interest), so the row always reconciles
  exactly. Unrealized values are stored per open trade per day inside `by_strategy` (`{ strategy: { realized,
  unrealized_delta, pnl, return_contrib } }`), from which the next day's delta is computed.
- **When it runs:** from the main tick, once per UTC day after 21:30 UTC (after the US close in both
  summer and winter time). It is idempotent per `day` (upsert) and backfills any missing days from portfolio history.
- **Pure core:** `buildNavRows(history, flows, attribution) → rows` has no I/O and is unit tested (flows split out,
  TWR chaining, drawdown, residual).
- **R.** Account-level aggregates switch to $ and % of equity. R stays the per-trade quality measure, and any R
  average becomes risk-weighted: `Σ pnl / Σ risk_usd`. Sums of R are removed from the dashboards.

## 3. Model book (shadow) and tracking

**The model book** is what the research engine would hold if it had traded the live universe since inception, with
perfect execution at modelled costs. It uses the same `runBook` as the research, fed the assets each pass has
already loaded in memory, so no extra data loads:

- At the end of each `runBookPass(group)`:
  `runBook({ assets: pool, references, sleeves: BOOK_SLEEVES scaled by risk_scale, envelope: from BOOK_LIMITS,
  start: inception, end: bar, starting_equity: equity at inception × group's share, stock_execution: "NEXT_OPEN" })`.
  Store `trading_model_book(day, grp, equity, positions jsonb [{symbol, strategy, size, entry, stop}], trades
  jsonb [closed since inception, compact])`.
- The model runs per group (crypto and stocks separately), because the passes run separately. The shared
  `max_positions` of 75 hardly binds; the difference is documented, not modelled. IBS_CLOSE has no model row in
  phase 1 (its signal log and fills still produce shortfall numbers).

**Tracking** (`lib/trading/fund/tracking.ts`, pure over rows; served by the dashboard API):

- **Tracking difference.** For each group, the rolling 20-day live return (attributed P&L of that group's
  strategies ÷ NAV) minus the model group's return. Annualized tracking error = stdev of the daily difference × √252.
- **Position overlap.** Symbols the model holds that live does not, and the reverse, each with the reason taken
  from the signal log (`MAX_GROSS`, `ALREADY_IN_SYMBOL`, a broker reject, …).
- **Implementation shortfall.** For every `ENTERED` signal whose trade has settled fills: `(fill_vwap − entry) /
  entry` in bps and in $ × qty, per strategy and per group, compared with `EXECUTION_RULES.ASSUMED_SLIPPAGE`. The
  same applies to exits whose model exit price is known (next open for stocks).
- **Missed signals.** Counts and the model P&L of signals blocked by each reason.

## 4. Health monitor

`runHealthChecks(now) → HealthReport { status: "ok" | "warn" | "critical", checks: HealthCheck[] }`, run at the end
of the main tick and of the intraday tick (so each tick watches the other). The report is stored in
`trading_settings.health` (jsonb) and shown in the app.

| Check | Critical when | Auto-repair |
|---|---|---|
| Main tick heartbeat | `last_tick_at` older than 40 min (checked from the intraday tick) | — |
| Intraday tick heartbeat | its last run older than 20 min (checked from the main tick), US market hours only | — |
| Protective stop | a broker position (not dust) has no resting sell stop / OCO leg | `ensureProtectiveStop` from the trade's `stop_price`; still critical if that fails or no trade row exists |
| Book pass freshness | the last closed session / UTC day has no pass 3 h after it was due | — |
| Broker ↔ DB drift | existing `orphan-report` / reconcile finds unmatched positions or quantities | reconcile already runs; the check only reports |
| Tick errors | ≥ 3 consecutive ticks with errors, or any error containing `alpaca_4`/`insufficient` | — |
| Kill switch / halts | tripped | — |

Alerts use `logEvent({ severity: "critical", push: true })` and are deduplicated per `(check, subject, UTC day)`
with the existing `symbolsLoggedOn` / `orphansToReport` pattern. A recovery (critical → ok) sends one "resolved" push.

A tick that never runs cannot report its own death, which is why each tick checks the other. The pure evaluation
`evaluateHealth(snapshot) → HealthReport` is unit tested; the I/O shell only gathers the snapshot.

## 5. Risk budget (the user delegated this)

Target: **about 15% worst drawdown in the 10-year backtest**, down from 21%. Live will likely be worse than
research because of survivorship, and a real-money book needs that margin.

- Calibrate by running `scripts/trading/book-research.ts` (runBook 2016-26, full universe, real costs) at
  `risk_scale` ∈ {1.0, 0.85, 0.75, 0.7, 0.6}. Pick the largest scale whose max DD ≤ 15% in train, validation and
  holdout. Record the table in `docs/trading/multi-strategy.md`. Expected: ≈ 0.7, CAGR ≈ 16–17%.
- Apply it through the existing `trading_settings.risk_scale` (an ordinary update: this is a reduction, and the
  `pending_risk_scale` delay exists for increases). Existing positions keep their size; new entries use the new
  scale.
- `RISK_ENVELOPE.MASTER_KILL_SWITCH_DD` 0.25 → 0.20. The current drawdown is 5.5% from a peak of $121.7K, so this
  does not trip.
- IBS_CLOSE is sized by notional (5 × 12%), not by `risk_pct`. It gets the same scale applied to `notional_pct`.

## 6. Dead-code removal

These modules no longer run in production but are still imported: the AI committee (`lib/trading/committee/**`,
paused), agent judge/rater/skill, learn-loop, the v2 4h scan (`V2_SCAN_ENABLED` off), and intraday auto-entry
scanning (`INTRADAY_AUTO_ENTRIES=false`). The rule is to remove only what is unreachable, proven by tracing the
imports from `app/api/**` and the tick entry points. Anything still used stays: the intraday tick (IBS_CLOSE, the
mirror), the "search trade" button, the trading chat. Tables stay; only code goes. This runs as its own PR after
1–5, with typecheck and tests green and one production tick verified.

## 7. Fund screen (trading tab)

A top "קרן" card on `mobile/app/(tabs)/trading.tsx` and a new `mobile/app/trading-fund.tsx` screen, both
Hebrew/RTL in the existing trading components' style:

- A health badge (ok / warn / critical, with the failing checks).
- NAV since inception (index 100), TWR since inception / month to date, current drawdown, and live vs model on
  one chart.
- Attribution per strategy (month to date and since inception, $ and % of NAV).
- Tracking: tracking difference and error per group, implementation shortfall per strategy vs assumed, and missed
  signals by reason.

Served by one new endpoint, `GET /api/v1/trading/fund` (auth like the other trading endpoints), returning a typed
`FundView` defined in `types-client.ts`.

## Data flow

```
pg_cron trading-tick (15m) ─▶ runTick ─▶ runBookTick ─▶ runBookPass ─┬─▶ trading_book_signals
                                   │                                  └─▶ runBook(model) ─▶ trading_model_book
                                   ├─▶ (≥21:30 UTC, once/day) updateNav ─▶ Alpaca history+activities ─▶ trading_nav_daily
                                   └─▶ runHealthChecks ─▶ settings.health (+ push on critical)
pg_cron trading-intraday-tick (5m) ─▶ … ─▶ runHealthChecks (watches the main tick)
app ─▶ GET /api/v1/trading/fund ─▶ nav + model + signals + health ─▶ tracking.ts ─▶ FundView
```

## Error handling

Every new step inside a tick is wrapped the way the book pass is: a failure appends to `summary.errors` and never
blocks trading, stops or settlement. The NAV update and the model book are idempotent upserts keyed by day, so a
retried or overlapping tick is harmless. Health checks do nothing except `ensureProtectiveStop`, which is the
existing, tested repair.

## Testing

`node --test` unit tests in `lib/__tests__/` for the pure cores:
- `buildNavRows`: cash-flow separation, TWR chaining, drawdown, residual
- attribution: realized plus unrealized delta sums to pnl
- tracking: tracking difference, shortfall bps, missed-signal grouping
- `evaluateHealth`: each check, dedupe keys, recovery
- the signal-log row builder

Then `npm run verify`. Production verification after each merge: one tick runs clean, the tables fill, and
`/api/v1/trading/fund` returns sane numbers against the Alpaca dashboard.

## Delivery

Separate PRs, each merged and verified in production, each with a `package.json` minor bump:
1. Signal log + NAV ledger (+ migration)
2. Model book + tracking
3. Health monitor
4. Risk budget (calibration evidence + settings + kill switch)
5. Fund screen (+ TestFlight version fields per CLAUDE.md, if a native build is cut)
6. Dead-code removal
