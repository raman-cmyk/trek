-- 0111 — absence means open.
--
-- The `availability` table records what happened to a day, never that a day
-- is free. Four writers touch it and all four are reactions: a guide blocking
-- a stretch, a booking holding days, a deposit confirming them, a
-- cancellation letting them go. Nothing has ever inserted a row meaning
-- "open" — except supabase/seed.sql, which handed each of the 48 demo guides
-- 271 of them, which is why this looked healthy in development.
--
-- The two halves of the application then read that silence differently.
-- `clashingDays` in booking.server.ts asks only for held/booked/blocked and
-- treats everything else as free. Every page that displays or searches guides
-- asked for status = 'open' and considered only the rows that came back — so
-- a day with no row was a day the guide was busy. The result in production:
-- a verified guide with a live trip had zero open days, so his own trek page
-- rendered "No open dates right now" instead of the request form, and he was
-- absent from every dated search. Bookable by the server, invisible to every
-- trekker.
--
-- The application now reads it the way the booking server always did: a day
-- is open unless a row says otherwise, out to a one-year horizon
-- (app/lib/open-days.ts). Rows saying 'open' remain valid and mean the same
-- thing as no row at all, so nothing needs backfilling or deleting.
--
-- This migration only realigns the index with the question now being asked.

comment on table availability is
  'What has happened to a guide''s day. A day with NO row is free: only '
  'held, booked and blocked mean taken. See app/lib/open-days.ts — the '
  'application derives open days by subtraction, out to a one-year horizon. '
  'Rows with status ''open'' are permitted and mean the same as no row.';

-- The old partial index served `where status = 'open'`, which nothing asks
-- any more. The queries now filter on the taken statuses, which are a small
-- minority of the table.
drop index if exists availability_day_open_idx;

create index if not exists availability_day_taken_idx
  on availability (day)
  where status in ('held', 'booked', 'blocked');

-- Per-guide windows (the trek page, the profile calendar, the guide's own
-- dashboard) all ask "which of this guide's days are taken, between here and
-- there".
create index if not exists availability_guide_taken_day_idx
  on availability (guide_id, day)
  where status in ('held', 'booked', 'blocked');
