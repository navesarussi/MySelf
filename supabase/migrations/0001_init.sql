-- Dedicated schema so this app never touches the existing public schema (shared with KupaPay/moneyApp).
create extension if not exists pgcrypto;
create schema if not exists myself;

create table if not exists myself.timeline_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  description text,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists myself.habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('build', 'quit')),
  target_note text,
  streak_count int not null default 0,
  best_streak int not null default 0,
  last_checked_on date,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists myself.goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  horizon text,
  first_step text,
  definition_of_done text,
  status text not null default 'active' check (status in ('active', 'done')),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists myself.commitments (
  id uuid primary key default gen_random_uuid(),
  commitment_date date not null default current_date,
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'done', 'missed')),
  created_at timestamptz not null default now()
);

create table if not exists myself.relationships (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_name text,
  last_contact_date date,
  reminder_days int,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists myself.content_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  body text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timeline_events_date_idx on myself.timeline_events (event_date desc);
create index if not exists goals_status_idx on myself.goals (status, sort_order);
create index if not exists commitments_date_idx on myself.commitments (commitment_date desc);
create index if not exists content_entries_category_idx on myself.content_entries (category);
