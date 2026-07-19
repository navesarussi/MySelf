-- Expand task status + priority check constraints.
alter table myself.tasks drop constraint if exists tasks_priority_check;
alter table myself.tasks
  add constraint tasks_priority_check
  check (priority in ('urgent', 'high', 'medium', 'low'));

alter table myself.tasks drop constraint if exists tasks_status_check;
alter table myself.tasks
  add constraint tasks_status_check
  check (status in ('open', 'in_progress', 'stuck', 'review', 'done'));
