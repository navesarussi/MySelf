# Trading — autonomous trading system

Tab **מסחר** in the Expo app. Backend in `lib/trading/**`, API in `app/api/v1/trading/**`, schema in
`supabase/migrations/0027_trading.sql` + `0028_trading_strategy_v2.sql`.

## Terminology

- **מערכת המסחר** — the whole end-to-end system.
- **הסוכן מסחר** — the AI part (`lib/trading/agent-judge.ts`).
- **האסטרטגיית מסחר** — deterministic part + AI part together.

## Strategy v2 (current)

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
