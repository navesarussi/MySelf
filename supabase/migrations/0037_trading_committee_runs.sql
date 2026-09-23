-- Trading committee shadow runs — full audit trail for multi-agent pipeline (Phase C).
-- Default shadow=true: persists decisions without broker submission from committee path.

CREATE TABLE IF NOT EXISTS myself.trading_committee_runs (
  id text PRIMARY KEY,
  ticket_id text NOT NULL UNIQUE,
  symbol text NOT NULL,
  strategy text NOT NULL,
  bar_time timestamptz NOT NULL,
  trigger_id uuid REFERENCES myself.trading_triggers (id) ON DELETE SET NULL,
  shadow boolean NOT NULL DEFAULT true,
  status text NOT NULL CHECK (status IN ('COMPLETED', 'FAILED', 'TIMEOUT', 'SKIP')),
  outcome text NOT NULL CHECK (outcome IN ('WOULD_EXECUTE', 'BLOCKED', 'SKIPPED', 'ERROR')),
  ticket jsonb NOT NULL,
  technical_report jsonb,
  fundamental_report jsonb,
  debate jsonb,
  soft_risk jsonb,
  certificate jsonb,
  execution_intent jsonb,
  would_have_executed boolean NOT NULL DEFAULT false,
  blocks text[] NOT NULL DEFAULT '{}',
  errors text[] NOT NULL DEFAULT '{}',
  injection_flags text[] NOT NULL DEFAULT '{}',
  latency_ms integer NOT NULL DEFAULT 0,
  model_versions jsonb NOT NULL DEFAULT '{}',
  prompt_versions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trading_committee_runs_created_idx ON myself.trading_committee_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS trading_committee_runs_symbol_idx ON myself.trading_committee_runs (symbol, created_at DESC);

ALTER TABLE myself.trading_committee_runs ENABLE ROW LEVEL SECURITY;
