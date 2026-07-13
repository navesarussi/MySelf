-- Per-habit reporting window + last reported timestamp
alter table myself.habits
  add column if not exists report_time time not null default '00:00',
  add column if not exists last_reported_at timestamptz;

-- Seed last_reported_at from the existing daily check-in date where present
update myself.habits
set last_reported_at = (last_checked_on::timestamptz)
where last_reported_at is null and last_checked_on is not null;
