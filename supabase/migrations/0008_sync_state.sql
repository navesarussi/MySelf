alter table myself.integration_tokens
  add column if not exists sync_status text not null default 'idle',
  add column if not exists sync_progress jsonb,
  add column if not exists sync_started_at timestamptz;
