-- 0062 — Write down three columns production already had.
--
-- The live database carries `insurance_rejected_at`, `insurance_rejected_reason`
-- and `insurance_rejected_by` on `bookings`. No migration creates them and no
-- code reads them, so they were added by hand — which means a fresh clone has
-- never matched production, and the difference was invisible until it broke
-- something.
--
-- It broke something. `insurance_rejected_by` carries a foreign key to
-- `users`, and PostgREST refuses to guess which key an embed means: with
-- `trekker_id` as well, every `trekker:users(...)` on a booking started
-- failing with PGRST201. supabase-js returns `{ data: null }` for a refused
-- query, every loader here reads that as `?? []`, and so the guide dashboard
-- said "No trips yet" to a guide with ten bookings — on a green build, with
-- green tests. Migration 0061's `meeting_set_by` made it a third candidate;
-- the breakage was already there.
--
-- The fix is in the app (every such embed now names its key, and
-- app/lib/embeds.test.ts fails the build if one stops). This migration only
-- makes the schema honest, so a local database reproduces the ambiguity the
-- real one has, rather than passing tests the real one would fail.
--
-- `if not exists` throughout: on production every line here is a no-op.

alter table bookings
  add column if not exists insurance_rejected_at timestamptz,
  add column if not exists insurance_rejected_reason text,
  add column if not exists insurance_rejected_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_insurance_rejected_by_fkey'
  ) then
    alter table bookings
      add constraint bookings_insurance_rejected_by_fkey
      foreign key (insurance_rejected_by) references users(id);
  end if;
end
$$;

comment on column bookings.insurance_rejected_by is
  'Ops member who rejected the insurance certificate. Added outside the
   migrations before 0062; no code reads it yet. Any users embed on bookings
   must name its foreign key because this column exists.';
