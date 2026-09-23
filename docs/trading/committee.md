# Trading committee layer (planned)

Multi-agent decision layer **above** the existing deterministic scanners (`scan-v2`, `scan-daily-trend`, intraday, `trade-finder`). Agents do not invent trades — they filter, debate, and shrink proposals that already passed math.

## Pipeline (target)

```
Deterministic scanners → OpportunityTicket
  → Analyst swarm (Technical + Fundamental/News)
  → Bull/Bear debate → DebateSynthesis
  → Soft Risk (LLM: skip / shrink / tighten stop only)
  → Hard Risk Envelope (CODE — final automatic gate) → RiskCertificate
  → ExecutionIntent → Alpaca paper
```

## Non-negotiable rules

1. **Fully automatic** — no human approval in the loop.
2. **Scanner-only entries** — no ticket from the scanner means no committee run.
3. **Dual risk** — Soft Risk (LLM) may only SKIP, shrink size (multiplier ≤ 1), or tighten stop. **Hard Risk is code and is the last authority** before any broker order. LLM is never the final gate.
4. **Fail-closed** — model timeout, invalid JSON, schema violation, or invariant breach → SKIP/deny, not ENTER.
5. **Paper first** — committee execution stays on Alpaca paper until explicit live gates pass.

## Phase A (contracts — `lib/trading/committee/`)

| Module | Purpose |
|--------|---------|
| `types.ts` | Zod schemas + TS types for all pipeline stages |
| `ids.ts` | Deterministic `opportunityTicketId(symbol, strategy, bar_time)` |
| `invariants.ts` | Pure geometry / fail-closed checks (no I/O) |
| `features.ts` | Documented feature keys adapters must compute in code |
| `helpers.ts` | Parsers (schema + invariants), soft-risk enforcement |

### Contract types

| Type | Role |
|------|------|
| `OpportunityTicket` | Normalized scanner output (LONG only in v1) |
| `AnalystReport` | Technical / news analyst JSON |
| `DebateSynthesis` | Bull/Bear facilitator output |
| `SoftRiskOpinion` | Enforced soft gate (raw LLM form uses `rawSoftRiskOpinionSchema`) |
| `RiskCertificate` | Hard envelope result (code-only) |
| `ExecutionIntent` | Broker order built from an approved certificate |

### Invariants enforced in parsers

- **OpportunityTicket:** `id` must match `opportunityTicketId(...)`; stop `<` entry; targets above entry; menu `rr` consistent with price geometry.
- **RiskCertificate:** `ok` requires `market_state === OPEN` and valid LONG geometry; `UNKNOWN` cannot be `ok`.
- **ExecutionIntent:** `LIMIT` requires `limit_price`; `MARKET` must not include `limit_price`.
- **Soft risk:** `enforceSoftRiskOpinion` snaps multiplier down (reuses `agent-judge.snapMultiplier`); stop tighten only toward entry.

Use `certificatePermitsExecution(cert)` before any future execution helper — it re-checks invariants.

### Feature keys (code-computed, not LLM)

See `COMMITTEE_FEATURE_KEYS` in `features.ts` (RSI, MACD hist/signal, EMAs, ATR, ADX, volume z, etc.).

## Phase B (scanner adapters — `lib/trading/committee/adapters/`)

Deterministic scanners map to `OpportunityTicket` via pure adapters. Features are computed in code (`committeeFeaturesFromSeries` + `macd` in `indicators.ts`); LLMs never invent indicator values.

| Scanner module | `CommitteeStrategy` | Adapter | `bar_time` source (matches `trading_triggers`) |
|----------------|---------------------|---------|-----------------------------------------------|
| `lib/trading/scan-v2.ts` → `strategy/candidates.ts` | `V2_SWING` | `adapters/v2-swing.ts` → `v2SwingToOpportunityTicket` | ISO of 4h setup bar open (`iso(candidate.t - H4)`) |
| `lib/trading/scan-daily-trend.ts` → `strategy/daily-trend.ts` | `DAILY_TREND` | `adapters/daily-trend.ts` → `dailyTrendToOpportunityTicket` | ISO of daily bar open (`iso(candidate.t)`) |
| `lib/trading/trade-finder.ts` → `strategy/intraday.ts` | `MANUAL_FINDER` | `adapters/trade-finder.ts` → `tradeFinderToOpportunityTicket` | ISO of 15m setup bar open (`iso(setup_bar_time)`) |

Intraday tick (`intraday-engine.ts`) uses the same underlying setups as trade-finder; a dedicated `INTRADAY` adapter can reuse `committeeFeaturesFromSeries` on `s15` when Phase D wires the committee runner.

Ticket ids are deterministic: `opportunityTicketId(symbol, strategy, bar_time)` (16-char SHA-256 prefix). Adapters call `parseOpportunityTicket` so geometry and id invariants are enforced before any downstream stage.

## Not in scope yet

Agent prompts, shadow runner, DB migrations, feature flags, tick wiring, or broker paths.

Full phased plan: architecture handoff doc (v1, 2026-09-23).

## Related code today

- Hard envelope: `lib/trading/risk-envelope.ts`, `sizing.ts`, `veto.ts`
- Single-agent judge (baseline): `lib/trading/agent-judge.ts`
- Live tick: `lib/trading/engine.ts`
