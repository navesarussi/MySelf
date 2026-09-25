-- Close the Data API to the myself schema for every role except the service role.
--
-- This Supabase project is shared with another app whose anon key ships in its
-- client, and `myself` is listed in the Data API's exposed schemas. anon and
-- authenticated held USAGE on the schema plus table privileges, and RLS was off
-- on almost every table — so that public key could read and change everything
-- here, OAuth refresh tokens included.
--
-- MySelf only ever connects with the service role (lib/supabase.ts), which keeps
-- its own grants and bypasses RLS, so neither step below changes app behaviour.

revoke all on all tables in schema myself from anon, authenticated;
revoke all on all sequences in schema myself from anon, authenticated;
revoke all on all functions in schema myself from anon, authenticated;
revoke usage on schema myself from anon, authenticated;

-- postgres (the role migrations run as) had default privileges granting every
-- new table here to anon and authenticated; later tables must not pick them back up.
alter default privileges for role postgres in schema myself revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema myself revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema myself revoke all on functions from anon, authenticated;

-- Second layer: with RLS on and no policies, a grant that reappears still reads nothing.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'myself' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table myself.%I enable row level security', t.relname);
  end loop;
end
$$;
