-- Nightly promotion gate evaluations (Phase G) — append-only audit log.
-- One canonical row per UTC calendar day (upsert on eval_day for idempotent cron).

CREATE TABLE IF NOT EXISTS myself.trading_committee_gate_evals (
  id text PRIMARY KEY,
  eval_day date NOT NULL UNIQUE,
  verdict text NOT NULL CHECK (verdict IN ('PASS', 'FAIL')),
  reasons text[] NOT NULL DEFAULT '{}',
  metrics jsonb NOT NULL,
  criteria jsonb NOT NULL,
  window_since timestamptz,
  window_limit integer NOT NULL DEFAULT 500,
  generated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trading_committee_gate_evals_day_idx
  ON myself.trading_committee_gate_evals (eval_day DESC);

ALTER TABLE myself.trading_committee_gate_evals ENABLE ROW LEVEL SECURITY;
