# Multi-strategy book (2026-09-27)

Deterministic, live on the Alpaca demo account. Code: `lib/trading/strategy/multi.ts` (pure strategies +
portfolio backtest — the same functions run live), `lib/trading/book/*` (universe, daily-bar store, daily passes).
Research: `scripts/trading/multi-research.ts` (10 years of daily bars, real costs: stocks 0.05% slippage + 0.01%
fees per side, crypto 0.2% fee + 0.1% slippage per side; train 2016-10→2021, validation 2022→2024-06, holdout after).

## Universe — every liquid asset

`trading_book_universe`, rebuilt daily with the intraday universe refresh: all Alpaca-listed stocks and ETFs with
price ≥ $10 and ≥ $20M/day (~1,900 stocks + ~500 ETFs, ETFs detected by issuer name), and every Alpaca crypto pair
with a ≥ $5M/day Binance market. Stock bars: split-adjusted SIP daily bars in `trading_daily_bars`, backfilled once
(spread over ticks) and appended daily; a re-read that moved > 0.5% (split) reloads the symbol. Crypto: Binance
daily bars fetched per pass.

## What trades (and what the evidence said)

| Family | Universe | Result (full universe, real costs) | Live |
|---|---|---|---|
| CRYPTO_TREND — 20-day breakout, BTC > SMA100, 2.5×ATR stop, 4×ATR chandelier, 10-day-low exit | crypto | positive in all periods (+1.15R / +0.15R / +0.33R); all 216 grid configs positive | 0.5% risk, ≤ 6 |
| PULLBACK — close > SMA200, SMA50 > SMA200, 3 lower closes, SPY > SMA200; 1.5×ATR stop, exit on a close above the 10-day high, 20-day time stop | stocks | +0.07R / −0.02R / +0.05R over ~450 trades a year — thin | 0.15% risk, ≤ 12 |
| TREND — 100-day breakout (the old daily-trend) | stocks | +0.08R / −0.14R / +0.01R — no edge across ~1,900 stocks (its earlier +0.24R came from a hand-picked large-cap list) | off |
| Mean reversion (RSI2, IBS), crypto pullback | — | no edge after costs | off |

Point-in-time liquidity and momentum filters did not rescue the stock families. A drawdown brake (half risk at
−10%, stop at −20%) locked the book at −20% and cut the 10-year CAGR from 21% to 5% — not used.

## Execution

- Crypto pass after 00:00 UTC on the closed daily bar: market entry, protective stop placed on the fill.
- Stock pass ~20 minutes after the close: the entry is an OTO order (market for pullbacks) with its stop attached,
  queued for the next open — never a window without a stop. Research showed next-open execution costs nothing
  versus the close (Sharpe 1.21 vs 1.18).
- Exits decided on the daily bar (signal, time stop, 10-day low, trail): crypto flattens immediately; stocks cancel
  the stop and queue a market sell for the open (`exit_pending`), closed when the broker is flat.
- Every 15-minute tick only mirrors the broker (fills, stops, exits); settlement books P&L/R from fills.
- Risk: sleeve risk × equity over the stop, ≤ 20% notional, buying power, and `checkAccountEntry`
  (≤ 25 positions, ≤ 8% open risk, −3%/−5% halts, −25% kill switch).
