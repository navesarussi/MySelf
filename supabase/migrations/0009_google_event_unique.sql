-- Partial unique index is not usable by PostgREST upsert onConflict.
drop index if exists myself.timeline_events_google_event_id_idx;

alter table myself.timeline_events
  add constraint timeline_events_google_event_id_key unique (google_event_id);
