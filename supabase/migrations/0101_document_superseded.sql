-- 0101 — "replaced" is not "rejected".
--
-- 0099 put a live document per (traveller, type) behind a partial unique
-- index, which means a clearer scan of the same passport has to stand the old
-- row down before it can be inserted. 0100 did that by rejecting the old row,
-- and the upload path was about to do the same — but a rejection is something
-- the office says to a trekker, and the trekker's page reads it back to them
-- as "your passport needs redoing" above a reason that says it does not.
--
-- So a replaced document gets its own column. `rejected_at` goes back to
-- meaning exactly one thing: we looked at this and said no.

alter table booking_documents
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by uuid references booking_documents(id) on delete set null;

-- The old index has to go first: clearing `rejected_at` below would make
-- three passports live at once under a rule that only counts refusals.
drop index if exists booking_documents_one_live_per_traveller;

-- The rows 0100 wrote are replacements, not refusals. Matched on the reason
-- text it wrote, which is the only mark they carry.
update booking_documents
   set superseded_at = rejected_at,
       rejected_at = null,
       rejected_reason = null,
       rejected_by = null
 where rejected_at is not null
   and rejected_reason like 'Superseded —%(0100).';

-- A document is out of the reckoning if it was refused OR replaced.
create unique index if not exists booking_documents_one_live_per_traveller
  on booking_documents (booking_id, traveller_id, type)
  where rejected_at is null and superseded_at is null and traveller_id is not null;

comment on column booking_documents.superseded_at is
  'Replaced by a newer copy of the same document for the same traveller. Not a
   rejection: nobody said no to it, and the trekker has nothing to do about it.';
