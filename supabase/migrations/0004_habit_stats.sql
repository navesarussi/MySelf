alter table myself.habits
  add column if not exists total_success_days int not null default 0,
  add column if not exists failure_count int not null default 0;

-- Backfill success days from existing streak data where possible
update myself.habits
set total_success_days = greatest(streak_count, best_streak)
where total_success_days = 0 and (streak_count > 0 or best_streak > 0);
