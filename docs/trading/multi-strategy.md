# Multi-strategy book (2026-09-28)

Deterministic, live on the Alpaca demo account. Code: `lib/trading/strategy/multi.ts` (pure strategies +
portfolio backtest — the same functions run live), `lib/trading/book/*` (universe, daily-bar store, daily passes).

## Research method (2026-09-28)

- Data: ~1,850 liquid US stocks (10y daily), 92 ETFs (dividend-adjusted, 1993+), 33 crypto (Binance daily),
  5-minute SIP bars for SPY/QQQ/IWM and for the 25 biggest opening gaps of every session since 2016-10.
- Periods: train 2016-10→2021, validation 2022→2024-06, holdout 2024-07→; ETF ideas also 2007-15.
- Costs per side: stocks 0.06%, ETFs 0.03%, crypto 0.3%. Stock signals execute at the next open.
- Survivorship control: the stock data holds only stocks listed today, which inflates every long strategy.
  Each stock trade is also measured **in excess of the equal-weight index of point-in-time-eligible stocks over
  the same days** — an idea is kept only if that excess is positive in every period.
- Screen first (event study, every signal), then the portfolio (`runBook`: capacity, sizing, overlap).

## What the evidence said

| Horizon | Idea | Result | Decision |
|---|---|---|---|
| Swing | Pullback (3 lower closes in an uptrend) — the previous live sleeve | excess over the universe ≈ 0 in every period; portfolio CAGR ≈ 0% | **retired** |
| Swing | Reversal: ≥10% 5-day drop, above SMA200, top-30% 12-1 momentum, SPY > SMA200 | excess +0.73% / +0.49% / +0.74% a trade (t 5.1 / 2.3 / 5.1) | **live** |
| Swing | Momentum pullback, RSI2 in leaders | positive but correlated 0.72 with reversal, weak in 2022-24 | off |
| Swing | Gap-up continuation, 52-week-high breakout, NR7 breakout | negative excess | off |
| Swing | ETF RSI2 mean reversion | +0.3% a trade 2007-26 but weak in the portfolio | off |
| Months | Stock momentum: top 20 by 12-1 momentum monthly, hold while top 50 | portfolio Sharpe 0.76 / 0.74 / 0.65, beats random picks by ~20%/yr | **live** |
| Months | Cross-asset rotation (13 ETFs, top 5 by blended momentum above SMA200) | Sharpe 0.69 / 1.15 / 0.00 / 1.44 (2007→), max DD ≤ 16% | **live** |
| Months | Market-regime gate on momentum (SPY < SMA200 → bonds) | cut returns (whipsaw) | not used |
| Weeks | Crypto trend (20-day breakout) | Sharpe 1.43 / 0.41 / 0.43 | **live** |
| Weeks | Crypto momentum rotation, crypto RSI2 | fail after 2021 | off |
| Day | SPY/QQQ/IWM intraday momentum (noise-band, Zarattini 2024) | negative on SPY/IWM, marginal on QQQ | off |
| Day | Gap fades, overnight holds on index ETFs | no stable edge | off |
| Day | IBS: equity ETF closing at the bottom of its range (IBS < 0.1) → buy the close, sell the next close | +0.26% / +0.15% / +0.07% / +0.19% a trade (t 12 / 7 / 2.7 / 6), holds with the 15:50 IBS | next: MOC execution |
| Day | Opening-range breakout on stocks in play | depends on intrabar order at 5m (−0.76R … +0.40R) | 1-minute data pending |

## The book (live)

| Sleeve | Horizon | Risk / trade | Slots | Alone 2016-26 |
|---|---|---|---|---|
| CRYPTO_TREND | weeks | 0.5% | 6 | CAGR 9.5%, Sharpe 0.95 |
| MOMENTUM | months (monthly rebalance) | 0.3% (5×ATR catastrophe stop) | 20 | CAGR 10.7%, Sharpe 0.70 |
| ASSET_ROTATION | months | 0.8% (5×ATR) | 5 | CAGR 4.9%, Sharpe 0.68 |
| REVERSAL | days (≤ 10) | 0.25% (4×ATR) | 40 | CAGR 4.4%, Sharpe 0.85, DD 7% |

Together, stock gross ≤ 100% of equity: **CAGR 23.8%, Sharpe 1.22, max DD 21%, ~480 trades a year**
(train 29.9% / S1.55, validation 10.4% / S0.67, holdout 24.6% / S1.15). Daily-return correlations: crypto vs
the rest ≈ 0.1; stock sleeves 0.5 with each other — all long equities, which is why gross is capped at 1.0
(1.5 → max DD 30%). Mean reversion needs many small slots: signals cluster in selloffs, and 10 big slots fill
on the first day and miss the deeper ones (40 × 0.125% beat 10 × 0.5% in every period).

Expect less live: the survivorship bias flatters stock momentum.

## Universe — every liquid asset

`trading_book_universe`, rebuilt daily with the intraday universe refresh: all Alpaca-listed stocks and ETFs with
price ≥ $10 and ≥ $20M/day (~1,900 stocks + ~500 ETFs, ETFs detected by issuer name), and every Alpaca crypto pair
with a ≥ $5M/day Binance market. Stock bars: split-adjusted SIP daily bars in `trading_daily_bars`, backfilled once
(spread over ticks) and appended daily; a re-read that moved > 0.5% (split) reloads the symbol. Crypto: Binance
daily bars fetched per pass.

## Earlier findings (2026-09-27)

A 100-day stock trend breakout showed no edge across ~1,900 stocks (its earlier +0.24R came from a hand-picked
large-cap list). A drawdown brake (half risk at −10%, stop at −20%) locked the book at −20% and cut the 10-year
CAGR from 21% to 5% — not used.

## Execution

- Crypto pass after 00:00 UTC on the closed daily bar: market entry, protective stop placed on the fill.
- Stock pass ~20 minutes after the close: the entry is an OTO market order with its stop attached,
  queued for the next open — never a window without a stop. Research showed next-open execution costs nothing
  versus the close (Sharpe 1.21 vs 1.18).
- Exits decided on the daily bar (signal, time stop, 10-day low, trail): crypto flattens immediately; stocks cancel
  the stop and queue a market sell for the open (`exit_pending`), closed when the broker is flat.
- Every 15-minute tick only mirrors the broker (fills, stops, exits); settlement books P&L/R from fills.
- Monthly sleeves (MOMENTUM, ASSET_ROTATION) act on the first session of each month: exits for holdings that
  dropped out of the ranks, entries for the new top names (ranks are prepared before exits are decided).
- Risk: sleeve risk × equity over the stop, ≤ 20% notional, stock gross ≤ 100% of equity, buying power, and
  `checkAccountEntry` (≤ 80 positions, ≤ 25% open risk at the catastrophe stops, −3%/−5% halts, −25% kill switch).
- Open positions of retired families (PULLBACK) are still managed to their exits.
