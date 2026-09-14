-- Chat → Cursor Cloud Agent bridge: job tracking + quota persistence.

CREATE TABLE IF NOT EXISTS myself.coding_agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'app')),
  task_text text NOT NULL,
  status text NOT NULL DEFAULT 'launched' CHECK (
    status IN ('blocked', 'launched', 'running', 'completed', 'failed', 'cancelled')
  ),
  cursor_agent_id text,
  cursor_run_id text,
  agent_url text,
  pr_url text,
  blocked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coding_agent_jobs_created_at_idx
  ON myself.coding_agent_jobs (created_at DESC);

CREATE INDEX IF NOT EXISTS coding_agent_jobs_in_flight_idx
  ON myself.coding_agent_jobs (status, created_at DESC)
  WHERE status IN ('launched', 'running');
