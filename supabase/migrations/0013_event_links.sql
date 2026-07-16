-- Attachments infrastructure for timeline events: images, notes, and links
-- can be associated with any event. Designed to extend later (more kinds,
-- attaching to periods) without schema churn.
create table if not exists myself.timeline_event_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references myself.timeline_events (id) on delete cascade,
  kind text not null check (kind in ('image', 'note', 'link')),
  url text,
  content text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint timeline_event_links_payload check (
    (kind in ('image', 'link') and url is not null)
    or (kind = 'note' and content is not null)
  )
);

create index if not exists timeline_event_links_event_idx
  on myself.timeline_event_links (event_id, sort_order, created_at);
