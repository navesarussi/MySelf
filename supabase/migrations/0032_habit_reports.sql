-- Per-day habit outcomes for history calendar (backfill + daily reports).
create table if not exists myself.habit_reports (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references myself.habits(id) on delete cascade,
  report_date date not null,
  outcome text not null check (outcome in ('check_in', 'fall')),
  reported_at timestamptz not null default now(),
  unique (habit_id, report_date)
);

create index if not exists habit_reports_habit_date_idx
  on myself.habit_reports (habit_id, report_date desc);

-- Seed the most recent known check-in per habit (no per-day log existed before).
insert into myself.habit_reports (habit_id, report_date, outcome)
select id, last_checked_on::date, 'check_in'
from myself.habits
where last_checked_on is not null
on conflict (habit_id, report_date) do nothing;
