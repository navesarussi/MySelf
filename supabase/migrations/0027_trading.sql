-- Autonomous trading system: settings, universe, triggers, journal, backtests, learning, chat.
-- Risk envelope constants live in code (lib/trading/config.ts) — never in the database.

CREATE TABLE IF NOT EXISTS myself.trading_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  phase text NOT NULL DEFAULT 'BACKTEST' CHECK (phase IN ('BACKTEST', 'SHADOW', 'PAPER', 'LIVE')),
  phase_started_at timestamptz NOT NULL DEFAULT now(),
  entries_paused boolean NOT NULL DEFAULT false,
  intraday_enabled boolean NOT NULL DEFAULT false,
  risk_scale numeric(4, 3) NOT NULL DEFAULT 1 CHECK (risk_scale >= 0 AND risk_scale <= 1),
  pending_risk_scale numeric(4, 3) CHECK (pending_risk_scale >= 0 AND pending_risk_scale <= 1),
  pending_risk_scale_at timestamptz,
  kill_switch_active boolean NOT NULL DEFAULT false,
  kill_switch_reason text,
  kill_switch_at timestamptz,
  agent_enabled boolean NOT NULL DEFAULT true,
  starting_equity numeric(16, 2) NOT NULL DEFAULT 100000,
  peak_equity numeric(16, 2) NOT NULL DEFAULT 100000,
  last_tick_at timestamptz,
  last_tick_summary jsonb,
  last_screen_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO myself.trading_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS myself.trading_universe (
  symbol text PRIMARY KEY,
  asset_class text NOT NULL CHECK (asset_class IN ('STOCK', 'CRYPTO_MAJOR', 'CRYPTO_ALT')),
  provider_symbol text NOT NULL,
  manual_enabled boolean NOT NULL DEFAULT true,
  screen_passed boolean NOT NULL DEFAULT false,
  screen_failures text[] NOT NULL DEFAULT '{}',
  eligibility text NOT NULL DEFAULT 'ACTIVE' CHECK (eligibility IN ('ACTIVE', 'DISABLED_POOR', 'REVIEW_SIM')),
  eligibility_changed_at timestamptz,
  eligibility_note text,
  bucket_id text,
  metrics jsonb,
  last_screened_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS myself.trading_param_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  params jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'ACTIVE', 'REJECTED', 'RETIRED')),
  evidence jsonb,
  locked_until timestamptz,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trading_param_sets_one_active ON myself.trading_param_sets ((status)) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS myself.trading_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  asset_class text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('INTRADAY', 'SWING')),
  bucket_id text,
  bar_time timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  vetoes text[] NOT NULL DEFAULT '{}',
  envelope_blocks text[] NOT NULL DEFAULT '{}',
  plan jsonb,
  deterministic_decision text NOT NULL CHECK (deterministic_decision IN ('ENTER', 'VETO', 'BLOCKED')),
  agent_decision text CHECK (agent_decision IN ('ENTER', 'SKIP')),
  agent_conviction smallint CHECK (agent_conviction BETWEEN 1 AND 5),
  agent_risk_multiplier numeric(3, 2),
  agent_reasoning text,
  agent_key_risks text[],
  agent_confidence text CHECK (agent_confidence IN ('LOW', 'MEDIUM', 'HIGH')),
  agent_model_version text,
  prompt_version text,
  agent_error text,
  injection_flags text[] NOT NULL DEFAULT '{}',
  param_version text NOT NULL,
  phase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (symbol, mode, bar_time)
);
CREATE INDEX IF NOT EXISTS trading_triggers_created_idx ON myself.trading_triggers (created_at DESC);

CREATE TABLE IF NOT EXISTS myself.trading_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid REFERENCES myself.trading_triggers (id) ON DELETE SET NULL,
  symbol text NOT NULL,
  asset_class text NOT NULL,
  bucket_id text NOT NULL,
  mode text NOT NULL,
  track text NOT NULL CHECK (track IN ('DETERMINISTIC', 'AGENT')),
  execution text NOT NULL CHECK (execution IN ('SHADOW', 'PAPER', 'LIVE')),
  state text NOT NULL CHECK (state IN ('PENDING', 'OPEN', 'RISK_FREE', 'CLOSED', 'CANCELLED')),
  trigger_timestamp timestamptz NOT NULL,
  trigger_snapshot jsonb NOT NULL,
  agent_decision text NOT NULL,
  agent_conviction smallint,
  agent_risk_multiplier numeric(3, 2),
  agent_reasoning text,
  agent_model_version text NOT NULL,
  prompt_version text NOT NULL,
  param_version text NOT NULL,
  entry_limit numeric NOT NULL,
  entry_price numeric,
  stop_price numeric NOT NULL,
  initial_stop_price numeric NOT NULL,
  target_price numeric NOT NULL,
  position_size numeric NOT NULL,
  remaining_size numeric NOT NULL,
  risk_amount numeric NOT NULL,
  entry_slippage_bps integer,
  exit_plan text CHECK (exit_plan IN ('TARGET_2R', 'TRAIL_2ATR')),
  trail_stop numeric,
  reached_1r boolean NOT NULL DEFAULT false,
  partial_exit_price numeric,
  exit_price numeric,
  exit_reason text,
  gapped_through_stop boolean NOT NULL DEFAULT false,
  realized_r numeric,
  realized_pnl numeric,
  fees_paid numeric NOT NULL DEFAULT 0,
  sim_state jsonb NOT NULL,
  last_bar_time timestamptz,
  mfe_r numeric NOT NULL DEFAULT 0,
  mae_r numeric NOT NULL DEFAULT 0,
  chart_bars jsonb,
  events jsonb NOT NULL DEFAULT '[]',
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  self_rating smallint CHECK (self_rating BETWEEN 1 AND 5),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_trades_state_idx ON myself.trading_trades (state, execution);
CREATE INDEX IF NOT EXISTS trading_trades_closed_idx ON myself.trading_trades (closed_at DESC);
CREATE INDEX IF NOT EXISTS trading_trades_symbol_idx ON myself.trading_trades (symbol, track);

CREATE TABLE IF NOT EXISTS myself.trading_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'critical')),
  symbol text,
  message text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_events_created_idx ON myself.trading_events (created_at DESC);

CREATE TABLE IF NOT EXISTS myself.trading_equity_snapshots (
  day date PRIMARY KEY,
  equity numeric(16, 2) NOT NULL,
  peak_equity numeric(16, 2) NOT NULL,
  open_risk_r numeric NOT NULL DEFAULT 0,
  open_positions integer NOT NULL DEFAULT 0,
  realized_r_day numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS myself.trading_backtests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL,
  years numeric NOT NULL,
  symbols text[] NOT NULL,
  param_version text NOT NULL,
  params jsonb NOT NULL,
  range_start timestamptz,
  range_end timestamptz,
  results jsonb NOT NULL,
  walk_forward jsonb,
  gate jsonb,
  skipped jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_backtests_created_idx ON myself.trading_backtests (created_at DESC);

CREATE TABLE IF NOT EXISTS myself.trading_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('CPI', 'FOMC', 'EARNINGS', 'TOKEN_UNLOCK', 'OTHER_MACRO')),
  date date NOT NULL,
  symbol text,
  note text,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trading_calendar_unique ON myself.trading_calendar (kind, date, coalesce(symbol, ''));

CREATE TABLE IF NOT EXISTS myself.trading_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  pending_command jsonb,
  command_status text CHECK (command_status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trading_chat_created_idx ON myself.trading_chat_messages (created_at DESC);
