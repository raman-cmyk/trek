-- 0010 — Role privileges, mirroring Supabase's defaults.
-- Supabase's security model: the API roles hold broad table privileges and RLS
-- is the ONLY gate. (Our migrations enable RLS default-deny on every table, so
-- granting here does not widen exposure — non-public tables still return zero
-- rows to anon/authenticated; service_role bypasses RLS by design for server-
-- side/ops use.) This makes local `supabase start` behave like production,
-- where these grants are applied automatically.

grant usage on schema public to anon, authenticated, service_role;

-- service_role: full access (bypasses RLS) — used by server-side ops loaders.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines in schema public to service_role;

-- authenticated: full DML, RLS decides which rows.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- anon: read-only, RLS decides which rows (public views/routes/permits/etc.).
grant select on all tables in schema public to anon;

-- Future objects created in this schema inherit the same grants.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant select on tables to anon;
