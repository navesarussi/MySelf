# Trading — autonomous trading system

Tab **מסחר** in the Expo app. Backend in `lib/trading/**`, API in `app/api/v1/trading/**`, schema in
`supabase/migrations/0027_trading.sql` + `0028_trading_strategy_v2.sql`.

## Terminology

- **מערכת המסחר** — the whole end-to-end system.
- **הסוכן מסחר** — the AI part (`lib/trading/agent-judge.ts`).
- **האסטרטגיית מסחר** — deterministic part + AI part together.

## Real trades only + books from the broker (2026-09-26)

- **Nothing is simulated any more.** Every entry goes to the Alpaca demo account or does not happen: the intraday
  universe is filtered to Alpaca-tradable symbols, the "search trade" button refuses non-tradable symbols, the
  daily-trend strategy no longer writes a DETERMINISTIC/SHADOW baseline row, and `isAccountTrade` counts only rows
  with a broker. The 104 simulated/shadow rows from 2026-09-14…26 moved to `trading_trades_archive` (migration 0050).
- **Books = Alpaca's fills** (`lib/trading/broker/ledger.ts`, `broker/settle.ts`). After every tick each closed
  broker trade is settled from its FILL activities: entry/exit VWAP, the crypto buy fee (taken in the asset) plus
  a 0.2% sell fee, P&L, and R = P&L ÷ (filled qty × (fill − initial stop)); a small partial fill or a fill through
  the stop is measured against the planned risk. `broker_settled_at` marks a settled row.
  The backfill (`scripts/trading/settle-backfill.ts`) moved the journal from −$21.3K to +$17.7K, matching the
  account (+$18.4K incl. open positions): PEPE had been booked at −54R (fee dust reopened the trade), and ~$10K
  of real P&L sat in rows marked "cancelled" whose entry Alpaca had already filled.
- **Sync fixes**: an existing broker stop is adopted instead of duplicated (the duplicate's `insufficient balance`
  left DOT/UNI stuck PENDING while Alpaca held them); fee dust (< $1) counts as flat everywhere; a position the
  broker no longer holds is closed and settled; entries skip symbols Alpaca still holds or has orders on (wash
  trades) and orders under $100.
- **R is always shown**: realized when closed, live against the fill's 1R while open (it used to vanish once the
  stop trailed past the entry), "awaiting fill" while pending; unfilled orders are not listed as trades.
- **Fees**: `EXECUTION_RULES.FEE_RATE` crypto 0.1% → 0.2% per side (measured), so every backtest uses real costs.

### Strategy decision (2026-09-26): intraday entries retired, daily trend is the core

Same code, 120 days, Alpaca's real costs (`INTRADAY_AUTO_ENTRIES = false` in `intraday-scan.ts`):

| Variant | Trades | Gross | Net (real costs) |
|---|---|---|---|
| Crypto 15m setup / 5m entry (live params) | 1,142 | +0.01R | **−0.39R** (±0.07) |
| Crypto 1h / 15m, min stop 3%, 24h time stop | 284 | +0.05R | −0.13R |
| US stocks 15m / 5m (33 liquid names, 90d IEX) | 103 | −0.13R | −0.24R |

No regime or trend filter turned it positive; the 42 real demo trades agreed. The demo account's profit came
from positions that stayed open for days — trend following. So automatic entries now come from the **daily-trend
strategy** (9 years, 458 trades, +0.24R, 95% CI 0.12–0.36), executed at the broker **deterministically**: the
agent comments but can no longer skip or shrink (its skips lowered out-of-sample expectancy, and when Gemini ran
out of credits every signal became a SKIP). v2 4h crypto breakout stays off: +0.11R IS (n=54, 23% DD) / +0.65R
OOS (n=11) with real fees — too thin to run. The main tick is scheduled by pg_cron (`trading-tick`, every 15 min).

## Intraday strategy — testing phase (2026-09-14, entries retired 2026-09-26)

Crypto only, tick every 5 minutes one minute after each 5m close (`/api/trading/intraday-tick`, Supabase **pg_cron** job `trading-intraday-tick`, `1-59/5 * * * *`, because Vercel Hobby
crons are daily-only; auth token lives in `myself.trading_cron_tokens`). Code: `lib/trading/strategy/intraday.ts`
(pure), `lib/trading/intraday-engine.ts` (live), `lib/trading/agent-rater.ts` (rating-only agent).

- **Setups on closed 15m bars** (one per bar, priority order): `WYCKOFF_SPRING` (tested sideways range → shakeout below
  support closing back inside), `WYCKOFF_LPS` (low-volume pullback to broken resistance after an SOS), `WYCKOFF_SOS`
  (wide-spread, high-volume close above the range), `BREAKOUT_15M` (20-bar high after a Bollinger squeeze, control group).
  Longs only with the 15m trend (close > EMA200, EMA50 > EMA200).
- **Entry on 5m**: within 30 min of the setup, the first 5m bar that closes up, holds the setup close and is above its
  EMA20. A 5m low through the stop first kills the setup. Stop = structure, widened to ≥ 1.2% / 0.6×ATR15; target =
  max(structure, 2R). BE at 1R, 2×ATR15 chandelier after 1.5R, time stop 12h.
- **Agent = rating only**: every entered trade gets a 1–10 score + short Hebrew paragraph, computed from the trigger
  snapshot (no look-ahead). It never changes entry, size or exits. Analytics → "does the rating predict outcome?"
  (correlation rating↔R, expectancy for ≥7 vs ≤4).
- **Risk (testing)**: envelope loosened in `config.ts` (2% crypto risk/trade, 10 positions, correlation cap off,
  −10R day / −25R week halts, kill switch at −30%). No leverage for crypto at Alpaca, so the 25% notional cap usually
  binds and real risk per trade is ~0.3–0.5% of equity. No macro/funding vetoes for intraday.
- **Backtest (90d, 26 coins, `scripts/trading/intraday-backtest.ts`)**: ~8.6 trades/day, gross +0.02R, net −0.25R
  after fees+slippage (≈0.27R/trade on a ~1.5% stop). Best: WYCKOFF_SOS in trend (gross +0.22R, net −0.05R).
  This is a measurement phase — not a proven edge.

### Universe + "search trade" button (2026-09-14)

- **Universe** (`lib/trading/intraday-universe.ts`, table `trading_intraday_universe`, rebuilt by the tick once a day
  after 12:00 UTC): Binance USDT pairs ≥ $10M/24h (no stablecoins/gold/tokenized stocks) + Alpaca-listed stocks/ETFs
  with price ≥ $5, 20-day avg dollar volume ≥ $50M (SIP daily bars), daily ATR ≥ 1.5%, top 150 by dollar volume.
  Stocks use Alpaca IEX 5m/15m bars (regular session only), enter 09:45–15:30 ET, are flattened 10 min before the
  close, and have a 0.5% minimum stop (crypto 1.2%). SPY/BTC are loaded as market context for the agent.
- **Search** (`POST /api/v1/trading/search`, `lib/trading/trade-finder.ts`): ranks every scannable symbol by tier
  (CONFIRMED setup → ARMED → RECENT (last 2h, still valid) → WATCH (trend only)) then deterministic score, skips
  symbols already held, and asks the agent to plan the top 3 (MARKET/LIMIT, entry, stop, target, 1–10 rating +
  explanation). Limits are enforced in code (`enforcePlan`): long only, LIMIT within 1×ATR15 below price, stop ≥ min
  distance and not beyond structure, target ≥ 2R — otherwise the deterministic plan is used. Stored in
  `trading_proposals` for 10 minutes.
- **Enter now** (`POST /api/v1/trading/proposals/:id/enter`): re-validates against the live price
  (`validateManualPlan`: stop below price, user target ≥ 2R, untouched target lifted to 2R), the risk envelope and
  buying power, then opens a `strategy_version = "manual"` trade (paper), managed by the intraday tick.

## Strategy v2 (4h scan disabled in the testing phase)

Research (2026-09, IS 2021-07→2024-03 / OOS 2024-03→2026-09, 16 crypto): v1 trend-pullback with a fixed 2R
target lost out of sample; **4h breakout from volatility compression, score ≥ 60, in a daily uptrend** was
positive in both windows (crypto IS +0.22R / OOS +0.37R per trade, Sharpe above buy & hold, max DD ~8% vs ~70%).
Stocks were roughly flat out of sample. Sample sizes are small — the 95% CI of expectancy still includes 0.

| Layer | Code |
|---|---|
| Risk envelope (hard constants) | `config.ts` (`RISK_ENVELOPE`, frozen), `risk-envelope.ts` |
| Universe screen + buckets | `universe.ts` |
| Multi-timeframe series (1d / 4h / 1h) | `strategy/series.ts`, `strategy/data-v2.ts` |
| Market structure: trend legs, levels, divergences | `strategy/structure.ts` |
| Setups, confluence score, structural targets (≥ 2R), TP extension | `strategy/candidates.ts` |
| Hard vetoes | `veto.ts` |
| Sizing (stop first, then size) | `sizing.ts` |
| Position state machine (1h bars; BE at 1R, chandelier after 2R, TP may only rise) | `position.ts` (`STRUCTURAL`) |
| Portfolio backtest | `strategy/backtest-v2.ts` |
| הסוכן מסחר: market read, thesis, invalidation, veto/shrink, target menu, TP-extension veto, lessons, playbook | `agent-judge.ts` |
| Learning: eligibility gate, agent value, walk-forward calibration | `learning.ts` |
| Phase gates (risk-adjusted vs buy & hold) | `gates.ts` |
| Live pipeline | `engine.ts → runTick` |

## What the AI may and may not do (enforced in code)

May: skip, shrink size (×0.75 / ×0.5), choose a larger target from the deterministic menu (all ≥ 2R),
decline a deterministic TP extension, write post-trade lessons, consolidate evidence-backed playbook rules.
May not: create a trade without a deterministic candidate, increase size, move a stop toward the loss,
enter below 2R, bypass the envelope. Every trigger is also simulated by the deterministic baseline so the
agent's value is measured, not assumed.

## Setup

1. Migrations apply on push (`db-apply.yml`).
2. Vercel env: `TRADING_CRON_SECRET`. Gemini key already exists.
3. GitHub secrets: `TRADING_CRON_SECRET`, `MYSELF_API_URL` — `trading-tick.yml` runs every 15 minutes.
4. App: Trading → Backtests → run. Starts in phase **BACKTEST**; advances only through gates.

CLI: `npx tsx scripts/trading/backtest.ts --preset CRYPTO --years 3`.

## Known limits

- Free data: stocks have ~2 years of hourly history (Yahoo 60m). Crypto via Binance has full history.
- ~15 trades/year on 16 crypto — statistical proof needs more symbols or more time.
- No news feed wired (sanitizer ready). Upcoming CPI dates must be added in Control → Calendar.
- **LIVE is intentionally not implemented** (no broker adapter). Check Israeli tax classification first.
