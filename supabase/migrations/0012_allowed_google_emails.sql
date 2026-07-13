-- Extra Google Sign-In allowlist entries, managed without touching Vercel env vars.
create table if not exists myself.allowed_google_emails (
  email text primary key,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

-- At most one row may be flagged as the calendar owner.
create unique index if not exists allowed_google_emails_primary_idx
  on myself.allowed_google_emails (is_primary)
  where is_primary;

insert into myself.allowed_google_emails (email, is_primary)
values
  ('navesarussi@gmail.com', true),
  ('lianbh2004@gmail.com', false)
on conflict (email) do nothing;
