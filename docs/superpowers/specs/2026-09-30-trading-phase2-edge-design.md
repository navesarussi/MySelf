# מערכת המסחר, phase 2: edge on clean data

Date: 2026-09-30 · Status: the user approved the paid data vendor and asked to start phase 2

## Why

Every stock result behind the live book was produced on stocks that are listed today (`tmp/claude-scratch/daily-all`,
1,952 symbols). Companies that went bankrupt, were acquired or were delisted are missing, which inflates every
long-only stock strategy. MOMENTUM, which buys the recent winners, is the most exposed. Before real money, the book
must be re-proven on a universe that includes the losers, and the risk budget must be recalibrated on those numbers.

## Decisions

1. **Vendor: EODHD "EOD Historical" ($19.99/month).** It has a REST API, US history back to the 1970s, a
   delisted-symbol list (`/api/exchange-symbol-list/US?delisted=1`), per-ticker EOD with `adjusted_close`, and a
   limit of 100k calls/day and 1k/min. Rejected: Norgate (Windows desktop app, no API — the research runs on a Mac
   and Vercel), Sharadar (more expensive for the same use). The key lives only in `.env.local` as `EODHD_API_KEY`:
   research runs locally, and live trading keeps using Alpaca data.
2. **Adjustment:** OHLC × (`adjusted_close` / `close`), i.e. split- and dividend-adjusted (total return). Live
   positions receive dividends in cash at Alpaca, so total return is the realistic P&L; ETFs were already
   dividend-adjusted.
3. **Universe:** every US common stock and ETF on NYSE, NASDAQ, NYSE ARCA, NYSE MKT and BATS, active **and**
   delisted, with bars since 2014-06 (warm-up for 2016-10). Liquidity stays point-in-time, as today (`isLiquid`:
   price ≥ $10, 50-day $ volume ≥ $20M on each day), so a delisted stock takes part exactly while it was tradable.
4. **Quality gate before any research conclusion:**
   - On symbols present in both datasets, daily returns from EODHD vs the current Alpaca-based data agree
     (median |Δ| < 0.05%, and < 1% of days off by more than 1%).
   - Delisted coverage is reported by year (EODHD itself says its delisted coverage is complete from 2018). A
     period with thin coverage is labelled as such, not trusted.
   - Reused tickers (a delisted XYZ and a live XYZ) must not merge histories: a gap > 30 days or a price jump
     > 5× splits a series.

## Work

### A. Data pipeline — `scripts/trading/data/eodhd.ts` (+ `lib/trading/research/eodhd-core.ts`, pure)

- `symbols`: active + delisted lists, filtered by exchange and type (Common Stock, ETF); saved to
  `tmp/claude-scratch/eodhd/symbols.json`.
- `sync`: per symbol, one call for the full EOD history since 2014-06 → `tmp/claude-scratch/eodhd/bars/<SYMBOL>.json`,
  in the research bar format `{t,o,h,l,c,v}` (adjusted). Resumable (skips files already there) and throttled
  below 1k/min. About 15–25k symbols, so one day of the call budget.
- `check`: the quality gate above, printed as a report and saved to `docs/trading/data-quality-2026-10.md`.
- Pure parts, unit tested: row → bar adjustment, symbol filtering, reused-ticker splitting, return comparison.

### B. The survivorship tax — `scripts/trading/book-research.ts` on `STOCK_DIR=…/eodhd/bars`

- Each live sleeve alone and the whole book, by period, on the clean universe vs the current data. The
  difference is the survivorship tax per sleeve.
- Rerun the stock-sleeve screen (excess over the point-in-time equal-weight universe, which now includes the
  losers) for MOMENTUM and REVERSAL.
- Decision rule, unchanged from 2026-09-28: a sleeve stays only if its excess is positive in every period and it
  adds to the book in `runBook`. A sleeve that fails is retired from new entries; its open positions are managed
  to their exits.
- Recalibrate the risk budget (`scripts/trading/risk-budget.ts`) to the same ≤ 15% drawdown rule on clean data.

### C. Allocation across sleeves — `lib/trading/strategy/allocation.ts` (pure) + `scripts/trading/allocation-research.ts`

Today each sleeve has a fixed `risk_pct`. Candidates, each tested in `runBook` in every period:
- **Inverse-volatility sleeve weights:** sleeve risk scaled by the inverse of its trailing 60-day return
  volatility, normalized to today's total.
- **Portfolio volatility targeting:** a book-wide multiplier = target vol ÷ trailing 20-day realized book vol,
  capped at [0.5, 1.5].

Adopted only if Sharpe improves in train, validation **and** holdout with max drawdown ≤ 15%. This can start now
on the current data; the final decision is confirmed on clean data. (The 2016-26 drawdown brake failed. Vol
targeting is different: it responds to volatility, not to losses, and does not lock the book out.)

### D. New sleeves (after B)

Screened with the same two stages (event study with excess over the point-in-time universe, then `runBook`), on
clean data only, strictly one at a time:
1. ETF time-series trend on the 92-ETF set (bonds/commodities/currencies — diversifies the equity-heavy book)
2. Low-volatility / quality tilt inside momentum (fewer blow-ups)
3. Sector momentum rotation (sector ETFs)

### E. In the platform

- `lib/trading/book/research-results.ts` (`BOOK_RESEARCH`, already shown in the app's control screen) is
  regenerated from the clean-data run, with a new `survivorship` block (per sleeve: current data vs clean) and the
  data-quality summary. The note in the app that says "results lean high — only stocks listed today" is replaced by
  the clean-data statement.
- Any change to live sleeves, risk or allocation ships like phase 1: tests, PR, merge, a production check, and the
  model book (which uses the same sleeves) follows automatically.

## Out of scope

Intraday data, fundamentals (the EODHD fundamentals plan is $59.99), and real money.

## Blocking step (user)

Subscribe to EODHD "EOD Historical" and add `EODHD_API_KEY=<key>` to `/Users/navesarussi/MySelf/.env.local`. C can
run before that.
