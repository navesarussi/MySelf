-- Committee reflection notes — deterministic post-run playbook hooks (Phase F).
-- Append-only via upsert on run_id; default off until COMMITTEE_REFLECTION=true.

CREATE TABLE IF NOT EXISTS myself.trading_committee_reflections (
  id text PRIMARY KEY,
  run_id text NOT NULL UNIQUE REFERENCES myself.trading_committee_runs (id) ON DELETE CASCADE,
  ticket_id text NOT NULL,
  symbol text NOT NULL,
  strategy text NOT NULL,
  note jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trading_committee_reflections_created_idx
  ON myself.trading_committee_reflections (created_at DESC);

CREATE INDEX IF NOT EXISTS trading_committee_reflections_symbol_idx
  ON myself.trading_committee_reflections (symbol, created_at DESC);

ALTER TABLE myself.trading_committee_reflections ENABLE ROW LEVEL SECURITY;
