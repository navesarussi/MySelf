# Trading — autonomous trading system

Tab **מסחר** in the Expo app. Backend in `lib/trading/**`, API in `app/api/v1/trading/**`, schema in
`supabase/migrations/0027_trading.sql`.

## Layers → files

| Spec section | Code |
|---|---|
| Risk envelope (hard constants) | `lib/trading/config.ts` (`RISK_ENVELOPE`, frozen), `lib/trading/risk-envelope.ts` |
| 1. Universe screen + buckets | `lib/trading/universe.ts` (daily, in `engine.ts → dailyScreen`) |
| 2–3. Regime filter + deterministic trigger | `lib/trading/setup.ts` |
| 4. Hard vetoes (earnings, CPI/FOMC, funding, unlocks, session edges) | `lib/trading/veto.ts`, calendar in `trading_calendar` |
| 5. Stop first, then size | `setup.ts → stopDistanceFor / buildTradePlan` |
| 6. Agent judgement (can only reduce) | `lib/trading/agent-judge.ts` (`enforceVerdict`, injection sanitizer) |
| 7. Position state machine | `lib/trading/position.ts` (shared by backtest + paper + shadow) |
| 8. Execution (limit, 0.3% slippage cap) | `position.ts → tryFill`; paper only — no broker adapter |
| 4a–d. Learning | `lib/trading/learning.ts` (bucket stats, eligibility gate, agent value, walk-forward calibration) |
| Phase gates | `lib/trading/gates.ts` |
| Live pipeline | `lib/trading/engine.ts → runTick` |
| Chat (read + proposals needing confirmation) | `lib/trading/chat.ts` |

## Tracks

Every trigger that survives the vetoes creates:

- a **DETERMINISTIC** shadow trade — the baseline signal, never limited by the portfolio envelope;
- an **AGENT** trade (if the agent entered and the envelope allows) — this is the *account*: SHADOW
  in the shadow phase, PAPER in the paper phase.

`agentValueReport` pairs them on the same triggers (agent R × multiplier, SKIP = 0) to answer whether
the agent layer makes money.

## Setup

1. Migration applies automatically on push (`db-apply.yml`).
2. Vercel env: `TRADING_CRON_SECRET` (any long random string). Gemini key already exists.
3. GitHub secrets: `TRADING_CRON_SECRET` (same value) and `MYSELF_API_URL`. Workflow `trading-tick.yml`
   runs every 15 minutes.
4. In the app: Trading → Backtests → run. The system starts in phase **BACKTEST** and only advances through
   the gates.

CLI backtest: `npx tsx scripts/trading/backtest.ts --years 4.5 --symbols BTC,ETH,SOL`.

## Known limits

- Free data: stocks have ~2 years of 4h history (Yahoo 60m). Crypto via Binance has full history.
- No news feed is wired; the sanitizer is ready for one (`sanitizeExternalText`).
- Upcoming CPI dates are not seeded — add them in Control → Calendar.
- Historical earnings are not vetoed in backtests (no free history); live trading fails closed.
- **LIVE is intentionally not implemented** (no broker adapter). Check Israeli tax classification first.
