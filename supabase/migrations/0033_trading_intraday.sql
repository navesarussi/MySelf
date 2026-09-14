-- Intraday strategy (crypto 15m setups / 5m entries) + rating-only agent — testing phase (2026-09-14).
-- Runs in its own per-minute tick (/api/trading/intraday-tick) scheduled by Supabase pg_cron
-- (Vercel Hobby crons are daily-only). The cron job itself is created out-of-band because its
-- Authorization token must not live in git; the token is stored in myself.trading_cron_tokens.

ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS agent_rating smallint CHECK (agent_rating BETWEEN 1 AND 10);
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS agent_rating_explanation text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS agent_rating smallint CHECK (agent_rating BETWEEN 1 AND 10);
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS agent_rating_explanation text;

ALTER TABLE myself.trading_settings ADD COLUMN IF NOT EXISTS intraday_lock_until timestamptz;
ALTER TABLE myself.trading_settings ADD COLUMN IF NOT EXISTS last_intraday_tick_at timestamptz;
ALTER TABLE myself.trading_settings ADD COLUMN IF NOT EXISTS last_intraday_summary jsonb;
UPDATE myself.trading_settings SET intraday_enabled = true;

CREATE INDEX IF NOT EXISTS trading_trades_strategy_state_idx ON myself.trading_trades (strategy_version, state);
CREATE INDEX IF NOT EXISTS trading_triggers_rating_queue_idx ON myself.trading_triggers (strategy_version, created_at) WHERE agent_rating IS NULL;

-- Scheduler tokens: service-role only (RLS on, no policies).
CREATE TABLE IF NOT EXISTS myself.trading_cron_tokens (
  token text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE myself.trading_cron_tokens ENABLE ROW LEVEL SECURITY;
