-- Trading strategy v2: setup/score on trades, analyst fields on triggers, lessons + playbook (self-learning).

ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS setup text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS score smallint;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS strategy_version text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS lesson_id uuid;
-- v2 manages positions with the STRUCTURAL exit plan.
ALTER TABLE myself.trading_trades DROP CONSTRAINT IF EXISTS trading_trades_exit_plan_check;
ALTER TABLE myself.trading_trades ADD CONSTRAINT trading_trades_exit_plan_check CHECK (exit_plan IN ('TARGET_2R', 'TRAIL_2ATR', 'STRUCTURAL'));
CREATE INDEX IF NOT EXISTS trading_trades_setup_idx ON myself.trading_trades (setup, track, state);

ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS setup text;
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS score smallint;
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS agent_market_read text;
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS agent_thesis text;
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS agent_invalidation text;
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS agent_target_index smallint;
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS agent_lessons_applied text[];

CREATE TABLE IF NOT EXISTS myself.trading_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid REFERENCES myself.trading_trades (id) ON DELETE CASCADE,
  symbol text NOT NULL,
  setup text,
  realized_r numeric NOT NULL,
  category text NOT NULL,
  decision_quality text NOT NULL CHECK (decision_quality IN ('GOOD', 'NEUTRAL', 'POOR')),
  what_happened text NOT NULL,
  lesson text NOT NULL,
  applies_when text NOT NULL,
  playbook_version integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trading_lessons_trade_unique ON myself.trading_lessons (trade_id);
CREATE INDEX IF NOT EXISTS trading_lessons_created_idx ON myself.trading_lessons (created_at DESC);

CREATE TABLE IF NOT EXISTS myself.trading_playbook (
  version integer PRIMARY KEY,
  rules jsonb NOT NULL,
  lessons_used integer NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETIRED', 'DISABLED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
