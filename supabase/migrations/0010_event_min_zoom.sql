alter table myself.timeline_events
  add column if not exists min_zoom text not null default 'months'
    check (min_zoom in ('years', 'months', 'days', 'hours'));
