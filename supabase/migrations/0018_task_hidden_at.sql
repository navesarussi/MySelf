-- Allow hiding external tasks locally when upstream refuses delete/update.

alter table myself.tasks
  add column if not exists hidden_at timestamptz;

create index if not exists tasks_hidden_at_idx
  on myself.tasks (hidden_at)
  where hidden_at is not null;
