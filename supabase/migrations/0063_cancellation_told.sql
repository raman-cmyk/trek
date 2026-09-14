-- 0063 — A cancellation somebody is actually told about.
--
-- A trekker can cancel their own trip from the trip page. When they do, the
-- booking flips to `cancelled_trekker`, the calendar reopens, the refund goes
-- out — and the guide, whose fortnight just emptied, is sent one SMS through
-- a provider that has no token in production. So in practice nobody is told.
-- The office is not told at all: `/ops/pipeline` lists cancellations, but only
-- if somebody happens to scroll to the bottom of it.
--
-- Email and SMS both need keys this project does not have yet, so the thing
-- that has to work without them is the app itself. Three columns make that
-- possible:
--
--   cancelled_at  — when, as a fact rather than an inference from updated_at,
--                   which moves whenever anything else on the row does.
--   cancelled_by  — who pressed it. "Your trekker cancelled" and "we cancelled
--                   this because the balance went unpaid" are different
--                   sentences, and the guide deserves the right one.
--   guide_saw_cancellation_at — so the guide's dashboard can put it in front of
--                   them once and then stop. A banner that never goes away is
--                   a banner nobody reads.
--
-- Backfilled from updated_at for trips already cancelled: approximate, and
-- better than a column that is null for every row that matters today.

alter table bookings
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references users(id) on delete set null,
  add column if not exists guide_saw_cancellation_at timestamptz;

update bookings
set cancelled_at = coalesce(cancelled_at, updated_at)
where status like 'cancelled%' and cancelled_at is null;

-- Everything already cancelled counts as seen: the office does not want a
-- dashboard that opens with six months of history the day this ships.
update bookings
set guide_saw_cancellation_at = coalesce(guide_saw_cancellation_at, now())
where status like 'cancelled%' and guide_saw_cancellation_at is null;

create index if not exists bookings_cancelled_idx
  on bookings (cancelled_at desc)
  where status like 'cancelled%';
