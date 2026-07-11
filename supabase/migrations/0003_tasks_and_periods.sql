-- Tasks + overlapping life periods for the personal dashboard.

create table if not exists myself.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  project text not null default 'אישי'
    check (project in ('Digital Scale', 'Glowy', 'KupaPay', 'אישי', 'אחר')),
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'done')),
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_status_idx on myself.tasks (status, priority);
create index if not exists tasks_project_idx on myself.tasks (project);

create table if not exists myself.life_periods (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_date date not null,
  end_date date,
  parent_id uuid references myself.life_periods (id) on delete set null,
  color text not null default '#7dd3c0',
  kind text not null default 'period'
    check (kind in ('period', 'milestone_band', 'relationship')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists life_periods_dates_idx on myself.life_periods (start_date, end_date);

grant usage on schema myself to anon, authenticated, service_role;
grant all on all tables in schema myself to anon, authenticated, service_role;
grant all on all sequences in schema myself to anon, authenticated, service_role;
alter default privileges in schema myself grant all on tables to anon, authenticated, service_role;

-- Milestone timeline events (idempotent by title+date)
insert into myself.timeline_events (event_date, title, description, category)
select v.event_date, v.title, v.description, v.category
from (values
  ('2002-01-02'::date, 'נולדתי', 'תחילת הסיפור.', 'אבן דרך'),
  ('2021-12-23'::date, 'התגייסתי', 'תחילת השירות הצבאי.', 'אבן דרך'),
  ('2025-04-19'::date, 'השתחררתי', 'סיום השירות הצבאי.', 'אבן דרך'),
  ('2023-07-26'::date, 'תחילת זוגיות', 'תקופת זוגיות שנמשכת עד היום.', 'זוגיות')
) as v(event_date, title, description, category)
where not exists (
  select 1 from myself.timeline_events e
  where e.event_date = v.event_date and e.title = v.title
);

-- Overlapping life periods
insert into myself.life_periods (title, start_date, end_date, color, kind, sort_order)
select v.title, v.start_date, v.end_date, v.color, v.kind, v.sort_order
from (values
  ('ילדות ונעורים', '2002-01-02'::date, '2021-12-22'::date, '#e8b86d', 'period', 10),
  ('תיכון', '2015-09-01'::date, '2019-06-30'::date, '#9aa0ab', 'period', 20),
  ('תואר', '2015-10-01'::date, '2021-06-30'::date, '#7dd3a7', 'period', 30),
  ('מכינה', '2020-08-01'::date, '2021-10-01'::date, '#7dd3c0', 'period', 40),
  ('גולן עם אחשלי', '2021-10-02'::date, '2021-12-22'::date, '#b5791f', 'period', 50),
  ('צבא', '2021-12-23'::date, '2025-04-19'::date, '#e2725b', 'period', 60),
  ('זוגיות', '2023-07-26'::date, null::date, '#c084fc', 'relationship', 70),
  ('אחרי שחרור', '2025-04-20'::date, null::date, '#7dd3c0', 'period', 80),
  ('אוסטרליה', '2026-04-08'::date, null::date, '#60a5fa', 'period', 90)
) as v(title, start_date, end_date, color, kind, sort_order)
where not exists (
  select 1 from myself.life_periods p where p.title = v.title and p.start_date = v.start_date
);

-- Nest high school under childhood when both exist
update myself.life_periods child
set parent_id = parent.id
from myself.life_periods parent
where child.title = 'תיכון'
  and parent.title = 'ילדות ונעורים'
  and child.parent_id is null;
