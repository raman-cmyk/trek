-- 0095 — a guide can be paid twice: something before, the rest after.
--
-- A payout row was created once, on completion, for the whole fee. That is
-- not how the work is actually paid for. A guide buys the bus to the
-- trailhead, food for the first days and often a porter's advance out of
-- their own pocket, weeks before anyone books a flight — so the office pays
-- part of the fee up front and settles the rest when the trek is walked.
-- There was nowhere to record the first half, so it lived in a WhatsApp
-- thread and the ledger said the guide was owed money they had already had.
--
-- `kind` tells the two apart. Everything already written is a settlement, so
-- the default and the backfill are both 'final'.
--
-- The unique index is on (booking_id, kind) rather than booking_id: one
-- advance and one settlement per trip, and createPayoutForBooking looks for
-- its own kind. Without this, a second row would make that function's
-- maybeSingle() return an error instead of the row it was checking for, and
-- it would cheerfully write a duplicate settlement.

alter table payouts add column if not exists kind text not null default 'final';

alter table payouts drop constraint if exists payouts_kind_check;
alter table payouts add constraint payouts_kind_check
  check (kind = any (array['advance'::text, 'final'::text]));

-- What the advance was for, in the office's own words. A row that says only
-- "NPR 15,000" is a number somebody has to remember the reason for.
alter table payouts add column if not exists note text;

create unique index if not exists payouts_booking_kind_key
  on payouts (booking_id, kind)
  where booking_id is not null;

comment on column payouts.kind is
  'advance = paid before the trek so the guide is not out of pocket;
   final = the settlement once it is walked. One of each per booking (0095).';
