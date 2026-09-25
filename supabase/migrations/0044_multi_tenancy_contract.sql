-- Per-account data, step 2 of 2 (contract).
--
-- Merge only once the per-account code (2.0.0) is live: it stamps user_id on
-- every write and upserts against the per-account keys, so the scaffolding 0043
-- kept for the previous code can go. Without the default, a write that forgets
-- its account now fails instead of landing on the primary account.

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
    execute format('alter table myself.%I alter column user_id drop default', t);
  end loop;
end
$$;

drop function if exists myself.primary_user_email();

-- Global unique keys: two accounts may now hold the same Google event, habit
-- day, project name or notification slot.
alter table myself.timeline_events drop constraint if exists timeline_events_google_event_id_key;
drop index if exists myself.tasks_source_external_id_uidx;
alter table myself.projects drop constraint if exists projects_name_key;
alter table myself.habit_reports drop constraint if exists habit_reports_habit_id_report_date_key;
alter table myself.notification_log drop constraint if exists notification_log_notif_type_ref_id_day_key_key;

alter table myself.integration_tokens drop constraint if exists integration_tokens_pkey;
alter table myself.integration_tokens
  add constraint integration_tokens_pkey primary key using index integration_tokens_user_provider_account_uidx;

-- The singleton flag the previous code read with `.eq("id", true)`.
alter table myself.agent_settings drop column if exists id;
alter table myself.notification_preferences drop column if exists id;
