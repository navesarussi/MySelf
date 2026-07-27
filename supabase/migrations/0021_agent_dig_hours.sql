-- Flexible dig hours (1–6 slots / day), Asia/Jerusalem wall clock.

ALTER TABLE myself.agent_settings
  ADD COLUMN IF NOT EXISTS dig_hours smallint[] NOT NULL DEFAULT '{8,13,21}';

UPDATE myself.agent_settings
SET dig_hours = ARRAY[morning_hour, midday_hour, evening_hour]::smallint[]
WHERE id = true
  AND (dig_hours IS NULL OR dig_hours = '{8,13,21}'::smallint[]);

ALTER TABLE myself.agent_settings
  DROP CONSTRAINT IF EXISTS agent_settings_dig_hours_len;

ALTER TABLE myself.agent_settings
  ADD CONSTRAINT agent_settings_dig_hours_len
  CHECK (cardinality(dig_hours) >= 1 AND cardinality(dig_hours) <= 6);
