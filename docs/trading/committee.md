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
| `lib/trading/intraday-engine.ts` → `strategy/intraday.ts` | `INTRADAY` | `adapters/intraday.ts` → `intradayToOpportunityTicket` | ISO of 15m setup bar open (`iso(setup_bar_time)`) — same key as intraday trigger upsert |
| `lib/trading/trade-finder.ts` → `strategy/intraday.ts` | `MANUAL_FINDER` | `adapters/trade-finder.ts` → `tradeFinderToOpportunityTicket` | ISO of 15m setup bar open (`iso(setup_bar_time)`) |

Ticket ids are deterministic: `opportunityTicketId(symbol, strategy, bar_time)` (16-char SHA-256 prefix). Adapters call `parseOpportunityTicket` so geometry and id invariants are enforced before any downstream stage.

## Phase C (shadow runner + audit — `lib/trading/committee/`)

Shadow-only by default: the committee runs the full pipeline, persists audits, and records `would_have_executed` — **no broker orders** from the committee path.

| Module | Purpose |
|--------|---------|
| `config.ts` | Env feature flags |
| `llm.ts` | Injectable Gemini client with per-stage timeout |
| `agents.ts` | Technical, fundamental/news, bull/bear/facilitator, soft risk |
| `hard-risk.ts` | `issueRiskCertificate` — code-only final gate |
| `execution.ts` | `buildExecutionIntent` from approved certificate |
| `runner.ts` | `runCommitteeShadow` orchestration |
| `store.ts` | Persist to `trading_committee_runs` |
| `hook.ts` | `runCommitteeShadowBatch` — isolated scanner hook |

### Feature flags (env)

| Variable | Default | Meaning |
|----------|---------|---------|
| `COMMITTEE_ENABLED` | `false` | Master switch — when off, hook is a no-op; baseline tick unchanged |
| `COMMITTEE_SHADOW` | `true` | Shadow mode — persist audits; do not submit committee orders to broker |
| `COMMITTEE_MAX_PER_TICK` | `3` | Top-K tickets per tick (by score) |
| `COMMITTEE_TIMEOUT_MS` | `120000` | Total budget; per-stage timeout ≈ budget / 5 → fail-closed SKIP |
| `COMMITTEE_CERT_MAX_AGE_MS` | same as timeout | Certificate TTL at execution gate |

### Shadow behavior

1. Scanners build `OpportunityTicket` via Phase B adapters (unchanged baseline entry/fill).
2. When `COMMITTEE_ENABLED=true`, `runCommitteeShadowBatch` runs top-K tickets through `runCommitteeShadow`.
3. Each run upserts one row in `trading_committee_runs` (ticket, reports, debate, soft risk, certificate, intent, latency, model/prompt versions, `shadow=true`).
4. `would_have_executed=true` when hard risk certificate permits execution and intent validates — logged only; **no Alpaca call** from committee code in Phase C/D.
5. LLM timeout or schema error → fail-closed (`status=FAILED` or `TIMEOUT`, `outcome=ERROR`, no execution intent).

### Persistence (`trading_committee_runs`)

Migration: `supabase/migrations/0037_trading_committee_runs.sql`. Unique on `ticket_id` for idempotent upsert per opportunity.

### Scanner hook (light wire)

`scan-daily-trend.ts`, `scan-v2.ts`, and `intraday-engine.ts` collect tickets during trigger upsert and call `runCommitteeShadowBatch` **after** the main loop. Baseline agent judge + paper fill paths are untouched when committee is off.

## Phase D (hard-risk gate + intraday + metrics)

| Module | Purpose |
|--------|---------|
| `gate.ts` | `assertCertificateAllowsExecution` — irrevocable fail-closed gate before any broker-bound intent |
| `execution.ts` | `buildExecutionIntent` / `buildCommitteeExecutionIntent` require gate pass |
| `metrics.ts` | Pure aggregators for shadow dual-track comparison |
| `adapters/intraday.ts` | Intraday tick → `OpportunityTicket` |

### Hard-risk gate invariants

1. **No certificate → no intent** — `buildExecutionIntent` calls `assertCertificateAllowsExecution` before and after intent construction.
2. **Soft risk cannot override hard deny** — if `certificate.ok === false`, gate returns the first block code; LLM allow=true is irrelevant.
3. **Envelope veto is final** — kill switch, daily halt, correlation, etc. appear in `certificate.blocks` and block execution.
4. **Certificate expiry** — `issued_at` on every certificate; gate rejects stale certs (`COMMITTEE_CERT_MAX_AGE_MS`, default = timeout budget).
5. **Intent must match certificate** — qty, stop, target, entry/limit, and `certificate_id` hash are verified at gate time.
6. **Shadow still calls gate** — `runCommitteeShadow` sets `would_have_executed` only after gate pass (records what would have executed, never submits).

Future non-shadow executor must call `buildCommitteeExecutionIntent` (or equivalent) — there is no bypass path.

### Shadow metrics helpers (`metrics.ts`)

Pure functions for later dual-track dashboards (no UI in Phase D):

- `summarizeCommitteeRuns(rows)` — totals, hard-block rate, latency p50/p90/p95
- `baselineAgreement(rows)` — agree/disagree vs baseline trigger flags when present
- `skipReasonHistogram(rows)` — soft-risk reasons + hard block codes
- `hardBlockRate(rows)`, `latencyPercentiles(rows)`

Unit-tested with fixture rows; query DB rows into `CommitteeMetricsRow` shape when building reports.

### Audit version stamps

Every persisted row merges full `COMMITTEE_PROMPT_VERSIONS` and fills missing model stages with `"not_run"` so prompt/model metadata is always complete.

## Not in scope yet

- Turning `COMMITTEE_SHADOW=false` or live Alpaca submission from committee path
- Dual-track UI dashboard
- Live ramp gates (G2–G3)
- Production migration apply / Vercel env (enable `COMMITTEE_ENABLED` manually when ready)

Full phased plan: architecture handoff doc (v1, 2026-09-23).

## Related code today

- Hard envelope: `lib/trading/risk-envelope.ts`, `sizing.ts`, `veto.ts`
- Single-agent judge (baseline): `lib/trading/agent-judge.ts`
- Live tick: `lib/trading/engine.ts`, intraday: `lib/trading/intraday-engine.ts`
