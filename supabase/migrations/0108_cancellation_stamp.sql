-- 0108 — say out loud what the database already has.
--
-- `bookings.cancelled_at` and `bookings.cancelled_by` exist in the live
-- database, with the right types and a foreign key, and appear in **no
-- migration file and no line of application code**. Somebody added them by
-- hand. Nothing writes them, so six of the twelve cancelled bookings carry no
-- stamp at all and the office cannot tell when any of this happened.
--
-- CLAUDE.md rule 1 is that every schema change is a migration. A column the
-- repo does not know about is a column the next migration will collide with,
-- and `create table` in a fresh environment would not produce it.
--
-- Verified against production before writing: both columns are already
-- `timestamptz` / `uuid`, nullable, and `bookings_cancelled_by_fkey` already
-- references users(id) on delete set null. So every clause below is a no-op
-- there and only the backfill does anything.

alter table bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid;

-- `add column if not exists` skips the whole clause on an existing column, so
-- a references clause written inline would never run where the column is
-- already there. The key has to be stated on its own.
do $$ begin
  alter table bookings
    add constraint bookings_cancelled_by_fkey
    foreign key (cancelled_by) references users(id) on delete set null;
exception when duplicate_object then null;
end $$;

comment on column bookings.cancelled_at is
  'When the trip was cancelled (0108). Rows cancelled before anything wrote it
   are backfilled from updated_at — the best evidence left, not a record.';
comment on column bookings.cancelled_by is
  'Who cancelled it (0108). Null when the platform did: the non-payment sweep
   picks the moment, and no person pressed anything.';

update bookings
   set cancelled_at = updated_at
 where status like 'cancelled%'
   and cancelled_at is null;
