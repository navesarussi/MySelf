-- Integration tokens (single-user)
create table if not exists myself.integration_tokens (
  provider text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);

-- Timeline event integration columns
alter table myself.timeline_events
  add column if not exists source text not null default 'manual',
  add column if not exists google_event_id text,
  add column if not exists title_override text,
  add column if not exists description_override text,
  add column if not exists hidden_at timestamptz,
  add column if not exists synced_at timestamptz;

create unique index if not exists timeline_events_google_event_id_idx
  on myself.timeline_events (google_event_id)
  where google_event_id is not null;

-- Relationships phone
alter table myself.relationships
  add column if not exists phone text;
