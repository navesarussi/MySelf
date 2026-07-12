alter table myself.timeline_events
  add column if not exists event_time time without time zone;
