-- Second live strategy: "daily trend" (docs/trading/research-2026-09.md — 9y walk-forward validated).
-- Runs alongside v2 (4h breakout) in the same tick, sharing the risk envelope, journal and broker mirror.
-- `strategy_version` already exists on trading_trades (added in 0028); add it to trading_triggers too and
-- widen the trigger uniqueness so a daily close and a 4h close never collide across the two strategies.

ALTER TABLE myself.trading_triggers ADD COLUMN IF NOT EXISTS strategy_version text NOT NULL DEFAULT 'v2';
ALTER TABLE myself.trading_triggers DROP CONSTRAINT IF EXISTS trading_triggers_symbol_mode_bar_time_key;
CREATE UNIQUE INDEX IF NOT EXISTS trading_triggers_unique ON myself.trading_triggers (symbol, mode, bar_time, strategy_version);

ALTER TABLE myself.trading_trades ALTER COLUMN strategy_version SET DEFAULT 'v2';
UPDATE myself.trading_trades SET strategy_version = 'v2' WHERE strategy_version IS NULL;

ALTER TABLE myself.trading_settings ADD COLUMN IF NOT EXISTS last_daily_trend_scan_date date;
