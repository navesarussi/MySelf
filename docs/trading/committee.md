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
| `COMMITTEE_DRY_RUN_LLM` | `false` | Stub LLM — deterministic opinions, no Gemini calls |

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

## Phase E (dual-track measurement + safe enablement)

| Module | Purpose |
|--------|---------|
| `dual-track.ts` | `compareDualTrack`, `committeeOnlyBlocks`, `baselineOnlyEntries`, `hardBlockAttribution`, `buildDualTrackReport` |
| `store.ts` | `getCommitteeDualTrackSummary` — joins `trading_committee_runs` to trigger baselines and closed trades via `trigger_id` |
| `hook.ts` | Fail-closed resilience — never throws; persists ERROR/SKIP audits on LLM/persist failures |
| `llm.ts` | `createCommitteeLlm` — selects Gemini or `COMMITTEE_DRY_RUN_LLM` stub |
| `app/api/v1/trading/committee-metrics/route.ts` | Read-only JSON summary (same auth as other trading admin routes) |

### Dual-track comparison

Given committee run rows plus baseline trigger/agent flags (when linked):

- **Agree / disagree** — both would enter or both would skip (`baselineAgreement` + case lists).
- **Committee-only blocks** — baseline would enter, committee would not (`committeeOnlyBlocks`).
- **Baseline-only entries** — baseline would skip, committee would execute (`baselineOnlyEntries`).
- **Hard-block attribution** — histogram of certificate / envelope block codes (`hardBlockAttribution`).

Use `compareDualTrack(rows)` or `getCommitteeDualTrackSummary({ sinceIso, limit })` for cron/reporting. Reuses Phase D `summarizeCommitteeRuns` helpers.

### Additional env flags

| Variable | Default | Meaning |
|----------|---------|---------|
| `COMMITTEE_DRY_RUN_LLM` | `false` | Deterministic stub opinions — smoke tests without Gemini token spend |

### Hook resilience

- Per-ticket and batch-level try/catch — scanner tick never crashes on committee failures.
- LLM unavailable (missing API key, credits, timeout) → `outcome=ERROR`, `would_have_executed=false`, audit persisted via `insertCommitteeRunSafe`.
- `buildCommitteeErrorRun` produces minimal fail-closed rows when the pipeline throws.

### Enablement checklist (ops — manual, ordered)

1. **Apply migration** — run `0037_trading_committee_runs.sql` (`npm run db:apply` or Supabase migrate).
2. **Keep defaults** — `COMMITTEE_ENABLED=false`, `COMMITTEE_SHADOW=true` until deliberately enabling shadow measurement.
3. **Enable shadow** — set `COMMITTEE_ENABLED=true` on Vercel; **leave `COMMITTEE_SHADOW=true`** (never flip shadow false without proof gates).
4. **Start small** — `COMMITTEE_MAX_PER_TICK=1` (or 2–3) for the first live ticks; raise only after audits look sane.
5. **Verify audits** — confirm rows appear in `trading_committee_runs` with `shadow=true`, prompt/model version stamps, and sensible `outcome` / `blocks`.
6. **Gemini dependency** — ensure `GOOGLE_GENERATIVE_AI_API_KEY` is set with credits; missing key or quota → fail-closed ERROR/SKIP (baseline paper path unchanged).
7. **Optional smoke** — `COMMITTEE_DRY_RUN_LLM=true` runs the full pipeline with stub LLM (no tokens); disable before real shadow measurement.
8. **Dual-track review** — GET `/api/v1/trading/committee-metrics?days=7` or call `getCommitteeDualTrackSummary` from a cron; review `committee_only_blocks` vs `baseline_only_entries` before any non-shadow gate.
9. **Never** set `COMMITTEE_SHADOW=false` or submit broker orders from committee until explicit live ramp (out of scope).

## Phase F (proof gates + reflection scaffolding — still shadow)

| Module | Purpose |
|--------|---------|
| `promotion-gates.ts` | `CommitteePromotionCriteria` + `evaluatePromotionGates` — pure PASS/FAIL over dual-track summaries |
| `block-attribution.ts` | `attributeCommitteeBlocks` — closed-trade PnL verdict per committee-only block (pure) |
| `reflection.ts` | `buildReflectionNote(run)` — deterministic post-run note (block layer, soft vs hard, debate tilt) |
| `store.ts` | `maybeRecordReflection` — optional DB insert when `COMMITTEE_REFLECTION=true` |
| `0038_trading_committee_reflections.sql` | Append-only reflection notes keyed by `run_id` |

### Promotion proof gates (code only — does not flip env)

Pure evaluator over `DualTrackSummary` from `compareDualTrack` / `getCommitteeDualTrackSummary`. Returns `PASS` or `FAIL` with reasons. **Does not read or mutate `COMMITTEE_SHADOW`.**

| Criterion | Default | Meaning |
|-----------|---------|---------|
| `minSampleSize` | 100 | Minimum committee runs in window |
| `minComparedBaselines` | 50 | Rows with baseline comparison flags |
| `maxDisagreementRate` | 35% | `disagree / compared` dual-track disagreement |
| `maxHardBlockFalsePositiveRate` | 25% | Share of hard blocks that skipped a winner — measured from closed-trade PnL, count heuristic as fallback |
| `minResolvedBlocksForPnlBasis` | 20 | Blocks with a closed baseline trade required before the PnL basis is used |
| `minNetRSavedPerBlock` | 0 R | Min average net R saved per resolved block (PnL basis only) |
| `maxLatencyP95Ms` | 90_000 | Shadow run latency p95 budget (ms) |
| `maxErrorRate` | 5% | ERROR outcomes / total runs |

Use `evaluatePromotionGates(summary)` or pass custom `CommitteePromotionCriteria`. Defaults live in `DEFAULT_PROMOTION_CRITERIA`.

#### Hard-block PnL attribution (closed trades)

`maxHardBlockFalsePositiveRate` is measured from money, not counts. A shadow run that denied a ticket the baseline entered has a real answer waiting for it: the baseline opened that trade on the same `trigger_id`, and it has since closed with a `realized_r`.

| Verdict | Meaning |
|---------|---------|
| `AVOIDED_LOSS` | Baseline trade closed red — the block saved `-realized_r`. **Good block.** |
| `SKIPPED_WINNER` | Baseline trade closed green — the block cost `realized_r`. **False positive.** |
| `SCRATCH` | Closed flat (abs(r) <= 1e-9) — resolved, but moves neither total. |
| `UNRESOLVED` | No linked trade, still `OPEN`, or `CANCELLED` (never entered) — excluded from the rate, never counted against the committee. |

`attributeCommitteeBlocks(rows)` (`block-attribution.ts`, pure) returns `blocks`, `resolved`, `skipped_winners`, `avoided_losses`, `false_positive_rate = skipped_winners / resolved`, plus `r_saved`, `r_missed`, `net_r_saved`, `net_r_per_block` and dollar totals. `compareDualTrack` exposes it at `summary.dual_track.block_attribution`; `getCommitteeDualTrackSummary` fills each row's `baseline_trade` by joining `trading_trades` on `trigger_id` (`pickBaselineTrade`: resolved over open, agent track over deterministic, then most recent close).

**Basis and fallback.** The gate uses the PnL basis once `resolved >= minResolvedBlocksForPnlBasis` (default 20); below that it falls back to the Phase F count heuristic (`committee_only_blocks / compared`). The two are **not** the same scale — the heuristic asks how often the committee blocks, the PnL rate asks how often it was wrong to — so `metrics.hard_block_fp_basis` and `hard_block_fp_sample` always state which number was judged, and the FAIL reason is named `hard_block_fp_pnl` or `hard_block_fp_heuristic`. The old heuristic value stays in `metrics.hard_block_false_positive_heuristic` so stored gate-eval history remains comparable.

**Why net R as well.** A rate alone flatters a committee that blocks nine small losers and one large winner: 10% false positives, and net −3.5R. `minNetRSavedPerBlock` (default 0) requires the blocks to be net positive in R, and is checked only on the PnL basis.

**Ops rule:** `COMMITTEE_SHADOW` may be set to `false` only after these gates **PASS for N consecutive calendar days** (duration tracked outside the evaluator — e.g. cron logging daily verdict). Even then, paper dual-track must show committee net edge before any live ramp (G2–G3).

### Reflection / playbook hooks (offline, optional)

After a shadow run is persisted, `maybeRecordReflection` may append a deterministic `ReflectionNote` when `COMMITTEE_REFLECTION=true` (default **false**). No LLM in v1 — built from structured run fields (`block_layer`, `soft_vs_hard`, `debate_tilt`, block codes, tags).

| Variable | Default | Meaning |
|----------|---------|---------|
| `COMMITTEE_REFLECTION` | `false` | Persist reflection notes to `trading_committee_reflections` after shadow audits |

Migration `0038_trading_committee_reflections.sql` — apply via ops (`npm run db:apply`); not required for shadow measurement when reflection is off.

## Phase G (nightly proof-gate evaluation — log only)

| Module | Purpose |
|--------|---------|
| `gate-eval.ts` | `runNightlyPromotionGateEval` — load dual-track summary, evaluate, persist verdict |
| `store.ts` | `insertGateEval`, `listGateEvalsSinceDay` — append-only daily rows in `trading_committee_gate_evals` |
| `app/api/v1/trading/committee-gate-eval/route.ts` | Cron-safe GET/POST (Bearer `CRON_SECRET`) — **never** flips env flags |

Migration: `supabase/migrations/0039_trading_committee_gate_evals.sql` — apply via ops (`npm run db:apply`); not required for the evaluator to run (persist fails closed to `persisted: false` until migration is applied).

### Nightly job flow

1. Load recent shadow runs via `getCommitteeDualTrackSummary({ sinceIso, limit })` (default **30 days**, limit **500**).
2. Run `evaluatePromotionGates` (Phase F pure evaluator).
3. Upsert one row per UTC calendar day into `trading_committee_gate_evals` (`eval_day` unique).
4. Return JSON with `verdict`, `reasons`, `metrics`, and `consecutive_pass_days`.

Query params (optional): `?days=30&limit=500`.

### Scheduler (manual ops — not in `vercel.json` by default)

Vercel Hobby allows only **two** daily cron jobs; this repo already schedules more than that (Pro / external schedulers). **Do not add** a Vercel cron entry until ops confirms plan headroom.

Trigger nightly eval manually or from GitHub Actions / pg_cron:

```bash
curl -X POST "https://myselfapp.xyz/api/v1/trading/committee-gate-eval?days=30" \
  -H "Authorization: Bearer $CRON_SECRET"
```

When a daily Vercel slot is available, add to `vercel.json`:

```json
{ "path": "/api/v1/trading/committee-gate-eval", "schedule": "45 6 * * *" }
```

### Reading consecutive PASS days

Response field `consecutive_pass_days` counts **UTC calendar days** ending at `eval_day` where the stored verdict is `PASS`, walking backward one day at a time. A `FAIL` or a **missing day** breaks the streak.

Example: need **7 consecutive PASS days** before ops even *consider* setting `COMMITTEE_SHADOW=false` (still manual; this job does not do it):

| eval_day | verdict | consecutive_pass_days (that day) |
|----------|---------|----------------------------------|
| Mon | FAIL | 0 |
| Tue | PASS | 1 |
| Wed | PASS | 2 |
| Thu | PASS | 3 |
| Fri | (no run) | — streak broken if Sat evaluated |
| Sat | PASS | 1 |

Query history:

```sql
SELECT eval_day, verdict, reasons, metrics
FROM myself.trading_committee_gate_evals
ORDER BY eval_day DESC
LIMIT 14;
```

`consecutive_pass_days` is computed at job time in the API response (not stored as a column). Recompute from rows with `countConsecutivePassDays` in code if needed.

### Still manual (non-negotiable)

- **`COMMITTEE_ENABLED`** / **`COMMITTEE_SHADOW`** — never mutated by Phase G.
- **`COMMITTEE_SHADOW=false`** — ops-only after sustained PASS streak + dual-track edge review (G2–G3).
- **Broker orders** — committee path still does not submit in Phase G.

## Not in scope yet

- Turning `COMMITTEE_SHADOW=false` or live Alpaca submission from committee path (requires proof gates + ops duration review)
- Dual-track UI dashboard
- Live ramp gates (G2–G3)
- LLM-generated reflection / CVRF playbook merge (future)

Full phased plan: architecture handoff doc (v1, 2026-09-23).

## Related code today

- Hard envelope: `lib/trading/risk-envelope.ts`, `sizing.ts`, `veto.ts`
- Single-agent judge (baseline): `lib/trading/agent-judge.ts`
- Live tick: `lib/trading/engine.ts`, intraday: `lib/trading/intraday-engine.ts`
