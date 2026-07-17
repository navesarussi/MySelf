-- External task sources (multi-provider inbox)

alter table myself.tasks
  alter column project_id drop not null;

alter table myself.tasks
  add column if not exists source text not null default 'manual',
  add column if not exists external_id text,
  add column if not exists external_list_id text,
  add column if not exists external_meta jsonb not null default '{}'::jsonb,
  add column if not exists synced_at timestamptz;

alter table myself.tasks
  drop constraint if exists tasks_source_identity_check;

alter table myself.tasks
  add constraint tasks_source_identity_check check (
    (source = 'manual' and project_id is not null and external_id is null)
    or (source <> 'manual' and external_id is not null and project_id is null)
  );

create unique index if not exists tasks_source_external_id_uidx
  on myself.tasks (source, external_id)
  where external_id is not null;

create index if not exists tasks_source_status_idx
  on myself.tasks (source, status);

alter table myself.integration_tokens
  add column if not exists settings jsonb not null default '{}'::jsonb;
