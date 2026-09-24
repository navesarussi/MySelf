-- Per-account data, step 1 of 2 (expand).
--
-- Every per-account table gets `user_id` — the owning account's email, a
-- reference to allowed_google_emails. Existing rows all belong to the primary
-- account, and so does anything the code deployed before this change inserts:
-- the column defaults to the primary account until 0044 removes the default.
--
-- Unique keys that were global gain a per-account twin, added next to the old
-- one so the deployed code's upserts still find their conflict target. 0044
-- drops the old ones once the per-account code is live. The new indexes are
-- not partial: PostgREST's onConflict can only target a plain unique index.

create or replace function myself.primary_user_email() returns text
language sql stable
as $$ select email from myself.allowed_google_emails where is_primary limit 1 $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'timeline_events', 'timeline_event_links', 'habits', 'habit_reports', 'goals', 'commitments',
    'life_periods', 'content_entries', 'relationships', 'tasks', 'projects', 'agent_settings',
    'agent_messages', 'agent_actions', 'notification_preferences', 'notification_log', 'push_tokens',
    'integration_tokens'
  ]
  loop
    execute format(
      'alter table myself.%I add column if not exists user_id text not null '
      'default myself.primary_user_email() '
      'references myself.allowed_google_emails (email) on update cascade',
      t
    );
    execute format('create index if not exists %I on myself.%I (user_id)', t || '_user_id_idx', t);
  end loop;
end
$$;

create unique index if not exists timeline_events_user_google_event_uidx
  on myself.timeline_events (user_id, google_event_id);
create unique index if not exists tasks_user_source_external_id_uidx
  on myself.tasks (user_id, source, external_id);
create unique index if not exists projects_user_name_uidx
  on myself.projects (user_id, name);
create unique index if not exists habit_reports_user_habit_date_uidx
  on myself.habit_reports (user_id, habit_id, report_date);
create unique index if not exists notification_log_user_slot_uidx
  on myself.notification_log (user_id, notif_type, ref_id, day_key);
create unique index if not exists integration_tokens_user_provider_account_uidx
  on myself.integration_tokens (user_id, provider, account_key);

-- One settings row per account instead of one row total. The old `id = true`
-- row stays so the deployed code's `.eq("id", true)` keeps finding it; rows for
-- other accounts get a null id. 0044 drops the column.
alter table myself.agent_settings drop constraint if exists agent_settings_pkey;
alter table myself.agent_settings alter column id drop not null, alter column id drop default;
alter table myself.agent_settings add primary key (user_id);

alter table myself.notification_preferences drop constraint if exists notification_preferences_pkey;
alter table myself.notification_preferences alter column id drop not null, alter column id drop default;
alter table myself.notification_preferences add primary key (user_id);
