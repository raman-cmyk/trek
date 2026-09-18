-- 0100 — give the documents that already exist a person to belong to.
--
-- Twenty-one documents across eight bookings, under seven typed names. This
-- does not try to be clever about which "odonell brian" is which: it seeds one
-- lead traveller per booking from the account holder, supersedes the
-- duplicates, and attaches what is left to that lead.
--
-- Superseded, not deleted. A passport uploaded three times is three real files
-- in the bucket and one of them is the one the office checked; rejecting the
-- older two with a reason keeps them readable, keeps `docsSettled` honest
-- (it ignores rejected rows), and leaves the retention sweep to remove the
-- files on its own schedule. Nothing here destroys anything.
--
-- The de-duplication runs BEFORE the attachment, not after: the partial unique
-- index from 0099 is checked per statement, so attaching three live passports
-- to one traveller and tidying up afterwards fails on the attachment itself.
-- Both bookings that carry duplicates are `party_size = 1`, so one lead is the
-- honest answer for them.

-- 1. A lead traveller for every booking that has documents.
insert into booking_travellers (booking_id, full_name, is_lead, added_by)
select distinct on (d.booking_id)
       d.booking_id,
       coalesce(nullif(btrim(u.full_name), ''), nullif(btrim(d.person_name), ''), 'Lead traveller'),
       true,
       b.trekker_id
  from booking_documents d
  join bookings b on b.id = d.booking_id
  left join users u on u.id = b.trekker_id
 where not exists (
         select 1 from booking_travellers t where t.booking_id = d.booking_id
       )
 order by d.booking_id, d.created_at;

-- 2. Keep one live document per (booking, type) — the most recently verified,
--    or failing that the most recent — and send the rest back with a reason a
--    person can read. The reason column has a 3-character minimum (0073), and
--    this is written to be read by the office rather than by a trekker: these
--    are historical duplicates, not a fresh refusal.
--
--    `verified_at` is cleared on the losers because 0073 says a document is
--    settled or waiting and never both, and one booking here has three
--    verified passports for a party of one. The verification that counts is
--    the one on the copy that survives; the reason text says the loser
--    carried one, so nobody reads the clearing as a document that was never
--    checked.
with ranked as (
  select id,
         verified_at,
         row_number() over (
           partition by booking_id, type
           order by (verified_at is not null) desc, verified_at desc nulls last, created_at desc
         ) as rn
    from booking_documents
   where rejected_at is null
)
update booking_documents d
   set rejected_at = now(),
       verified_at = null,
       verified_by = null,
       rejected_reason = case
         when r.verified_at is not null then
           'Superseded — this copy was checked, and a newer copy of the same document is on the trip (0100).'
         else
           'Superseded — a newer copy of this document is on the trip (0100).'
       end
  from ranked r
 where r.id = d.id
   and r.rn > 1;

-- 3. Every document — the live one and the superseded ones — belongs to that
--    lead. The rejected copies are attached too: they are that person's
--    history, and the unique index only counts live rows.
update booking_documents d
   set traveller_id = t.id
  from booking_travellers t
 where t.booking_id = d.booking_id
   and t.is_lead
   and d.traveller_id is null;
