-- Motivation agent: settings, message log, tool action log (single-user app).

CREATE TABLE IF NOT EXISTS myself.agent_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  whatsapp_phone text,
  morning_hour smallint NOT NULL DEFAULT 7 CHECK (morning_hour >= 0 AND morning_hour <= 23),
  evening_hour smallint NOT NULL DEFAULT 21 CHECK (evening_hour >= 0 AND evening_hour <= 23),
  tone text NOT NULL DEFAULT 'warm' CHECK (tone IN ('warm', 'direct', 'humorous')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO myself.agent_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS myself.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel text NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'app')),
  content text NOT NULL,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS myself.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL,
  tool_input jsonb,
  tool_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_messages_created_at_idx ON myself.agent_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS agent_actions_created_at_idx ON myself.agent_actions (created_at DESC);
