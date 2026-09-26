-- Live error reporting: webhook config (service-role only) and dedupe ledger.

create table if not exists myself.system_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table myself.system_config enable row level security;

create table if not exists myself.error_reports (
  fingerprint text primary key,
  count integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_sent_at timestamptz,
  last_payload jsonb
);

alter table myself.error_reports enable row level security;

create index if not exists error_reports_last_sent_at_idx
  on myself.error_reports (last_sent_at desc nulls last);
