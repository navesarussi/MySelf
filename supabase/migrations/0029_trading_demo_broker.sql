-- Live demo trading: Alpaca paper broker + AI-discretion baseline flag.

ALTER TABLE myself.trading_settings ADD COLUMN IF NOT EXISTS execution_venue text NOT NULL DEFAULT 'SIM';
ALTER TABLE myself.trading_settings DROP CONSTRAINT IF EXISTS trading_settings_execution_venue_check;
ALTER TABLE myself.trading_settings ADD CONSTRAINT trading_settings_execution_venue_check CHECK (execution_venue IN ('SIM', 'ALPACA_PAPER'));

ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS broker text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS broker_entry_order_id text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS broker_stop_order_id text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS broker_target_order_id text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS broker_status text;
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS broker_filled_qty numeric;
-- Would the deterministic strategy alone have taken this trade? (AI-discretion measurement)
ALTER TABLE myself.trading_trades ADD COLUMN IF NOT EXISTS baseline_enter boolean NOT NULL DEFAULT true;
ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS baseline_enter boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS trading_trades_broker_idx ON myself.trading_trades (broker, state);
