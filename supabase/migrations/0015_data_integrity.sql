-- Remove duplicate rows and enforce identity constraints so sync/seed/API cannot
-- create parallel copies of the same logical record.

-- Goals: keep the oldest row per content fingerprint.
with ranked as (
  select id,
    row_number() over (
      partition by
        lower(trim(title)),
        coalesce(lower(trim(category)), ''),
        coalesce(lower(trim(horizon)), ''),
        coalesce(lower(trim(first_step)), ''),
        coalesce(lower(trim(definition_of_done)), ''),
        status
      order by created_at asc, sort_order asc
    ) as rn
  from myself.goals
)
delete from myself.goals
where id in (select id from ranked where rn > 1);

-- Habits: keep the most active row per name.
with ranked as (
  select id,
    row_number() over (
      partition by lower(trim(name))
      order by best_streak desc, streak_count desc, created_at asc
    ) as rn
  from myself.habits
  where not archived
)
delete from myself.habits
where id in (select id from ranked where rn > 1);

-- External tasks: keep the most recently synced row per provider identity.
with ranked as (
  select id,
    row_number() over (
      partition by source, external_id
      order by synced_at desc nulls last, updated_at desc nulls last, created_at asc
    ) as rn
  from myself.tasks
  where external_id is not null
)
delete from myself.tasks
where id in (select id from ranked where rn > 1);

-- Timeline events: keep the oldest row per date + title.
with ranked as (
  select id,
    row_number() over (
      partition by event_date, lower(trim(title))
      order by created_at asc
    ) as rn
  from myself.timeline_events
)
delete from myself.timeline_events
where id in (select id from ranked where rn > 1);

-- Partial unique index is not usable by PostgREST upsert onConflict (see 0009).
drop index if exists myself.tasks_source_external_id_uidx;
alter table myself.tasks drop constraint if exists tasks_source_external_id_key;
alter table myself.tasks
  add constraint tasks_source_external_id_key unique (source, external_id);

create unique index if not exists goals_identity_uidx on myself.goals (
  lower(trim(title)),
  coalesce(lower(trim(category)), ''),
  coalesce(lower(trim(horizon)), ''),
  coalesce(lower(trim(first_step)), ''),
  coalesce(lower(trim(definition_of_done)), ''),
  status
);

create unique index if not exists habits_name_active_uidx
  on myself.habits (lower(trim(name)))
  where archived = false;
