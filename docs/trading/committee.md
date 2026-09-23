# Trading committee layer (planned)

Multi-agent decision layer **above** the existing deterministic scanners (`scan-v2`, `scan-daily-trend`, intraday, `trade-finder`). Agents do not invent trades — they filter, debate, and shrink proposals that already passed math.

## Pipeline (target)

```
Deterministic scanners → OpportunityTicket
  → Analyst swarm (Technical + Fundamental/News)
  → Bull/Bear debate → DebateSynthesis
  → Soft Risk (LLM: skip / shrink / tighten stop only)
  → Hard Risk Envelope (CODE — final automatic gate)
  → ExecutionIntent → Alpaca paper
```

## Non-negotiable rules

1. **Fully automatic** — no human approval in the loop.
2. **Scanner-only entries** — no ticket from the scanner means no committee run.
3. **Dual risk** — Soft Risk (LLM) may only SKIP, shrink size (multiplier ≤ 1), or tighten stop. **Hard Risk is code and is the last authority** before any broker order. LLM is never the final gate.
4. **Fail-closed** — model timeout, invalid JSON, or schema violation → SKIP/deny, not ENTER.
5. **Paper first** — committee execution stays on Alpaca paper until explicit live gates pass.

## Phase A (this PR)

Contracts only under `lib/trading/committee/`:

| Type | Role |
|------|------|
| `OpportunityTicket` | Normalized scanner output |
| `AnalystReport` | Technical / news analyst JSON |
| `DebateSynthesis` | Bull/Bear facilitator output |
| `SoftRiskOpinion` | LLM soft gate (shrink/tighten only) |
| `RiskCertificate` | Hard envelope result (code-only) |
| `ExecutionIntent` | Broker order built from certificate |

Pure helpers: schema parsers, `snapCommitteeMultiplier`, `tightenStopForLong`, `enforceSoftRiskOpinion`, `certificatePermitsExecution`.

## Not in scope yet

- Scanner adapters, agent prompts, shadow runner, DB migrations, feature flags, or broker wiring.
- See `uploads/myself-trading-multiagent-architecture-v1.md` for the full phased plan.

## Related code today

- Hard envelope: `lib/trading/risk-envelope.ts`, `sizing.ts`, `veto.ts`
- Single-agent judge (baseline): `lib/trading/agent-judge.ts`
- Live tick: `lib/trading/engine.ts`
