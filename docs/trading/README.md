# Trading — autonomous trading system

Tab **מסחר** in the Expo app. Backend in `lib/trading/**`, API in `app/api/v1/trading/**`, schema in
`supabase/migrations/0027_trading.sql` + `0028_trading_strategy_v2.sql`.

## Terminology

- **מערכת המסחר** — the whole end-to-end system.
- **הסוכן מסחר** — the AI part (`lib/trading/agent-judge.ts`).
- **האסטרטגיית מסחר** — deterministic part + AI part together.

## Intraday strategy — testing phase (2026-09-14)

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
