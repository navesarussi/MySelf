# Trading research — 2026-09

Protocol: train 2017-07→2021-12 (development), validation 2022-01→2024-06 (selection), holdout 2024-07→2026-09
(touched once per hypothesis). 62 daily series: 16 crypto (Binance), 25 stocks, 21 ETFs (Yahoo, 10y).
Stocks are today's large caps → survivorship bias; ETFs are the bias-free check.
Engine: `lib/trading/strategy/daily-trend.ts` (same position state machine, sizing and risk envelope as live).

## Deterministic: daily trend breakout

Grid of 96 combinations on train; median Sharpe 0.92 (the family is robust, not one lucky setting).
Chosen on validation: 100-day breakout, 3×ATR stop, 3×ATR chandelier trail, 5 concurrent positions.

| Period | Trades | Expectancy | CAGR | Sharpe | Max DD | SPY Sharpe / DD |
|---|---|---|---|---|---|---|
| Train | 229 | +0.34R | 9.9% | 1.21 | 6.0% | 0.86 / 34% |
| Validation | 100 | +0.22R | 4.6% | 0.64 | 6.3% | 0.38 / 25% |
| Holdout | 134 | +0.09R | 2.8% | 0.40 | 7.3% | 1.02 / 19% |
| **2017-07→now** | **458** | **+0.24R (95% CI 0.12–0.36)** | 6.6% | 0.86 | 7.3% | |

- Statistically significant positive expectancy over 9 years, with a very small drawdown — but decaying.
- 2×ATR stops collapsed in validation (kill switch); 3×ATR survived — wide stops are required.
- Learned on train, confirmed only weakly on validation: volume ≥1.2× (≈+0.42R vs +0.08R), breakout from
  compression (≈+0.40R vs ≈0R when volatility already wide), avoid ADX > 32 (≈−0.09R).
  As hard filters: validation +0.24R vs +0.22R, lower DD, fewer trades — marginal.

## AI: does the trading agent's skill add value?

`scripts/trading/agent-backtest.ts` shows every signal to the model anonymized (no symbol/date, prices rebased).
Skill: `lib/trading/agent-skill.ts` (skill-v1-2026-09).

| | Validation exp / Sharpe | Holdout exp / Sharpe |
|---|---|---|
| Deterministic only | +0.22R / 0.64 | +0.09R / 0.40 |
| Agent as veto filter | +0.12R / 0.46 | −0.06R / −0.15 |
| Agent as ranker (chosen after seeing validation) | +0.29R / 0.85 | +0.01R / 0.14 |

- The agent separates signals slightly (taken vs skipped: +0.15R vs +0.03R validation; +0.09R vs −0.02R holdout).
- At portfolio level it did **not** beat the deterministic strategy out of sample. The validation gain did not replicate.
- Conclusion: the AI layer is not proven to add money. Keep measuring it (shadow track, demo account); do not give it
  more authority on the strength of these results.
