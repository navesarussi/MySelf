-- Push notifications: device tokens, preferences, dedup log (single-user app).

CREATE TABLE IF NOT EXISTS myself.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expo_push_token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android', 'web')),
  device_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_tokens_updated_at_idx ON myself.push_tokens (updated_at DESC);

CREATE TABLE IF NOT EXISTS myself.notification_preferences (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  agent boolean NOT NULL DEFAULT true,
  relationships boolean NOT NULL DEFAULT true,
  habits boolean NOT NULL DEFAULT true,
  tasks boolean NOT NULL DEFAULT true,
  timeline boolean NOT NULL DEFAULT true,
  quiet_start_hour smallint NOT NULL DEFAULT 22 CHECK (quiet_start_hour >= 0 AND quiet_start_hour <= 23),
  quiet_end_hour smallint NOT NULL DEFAULT 7 CHECK (quiet_end_hour >= 0 AND quiet_end_hour <= 23),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO myself.notification_preferences (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS myself.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notif_type text NOT NULL,
  ref_id text NOT NULL DEFAULT '',
  day_key text NOT NULL,
  title text,
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notif_type, ref_id, day_key)
);

CREATE INDEX IF NOT EXISTS notification_log_created_at_idx ON myself.notification_log (created_at DESC);
