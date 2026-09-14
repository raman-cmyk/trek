-- 0065 — A trekker's document can be turned down.
--
-- `booking_documents` had two states: verified, or not yet. So an office
-- reviewer who opened a passport photo that was blurred, cropped, or of the
-- wrong page had nowhere to record that. The row stayed "not verified", which
-- reads identically to "nobody has looked at it", and the only way to tell the
-- trekker was a message that nothing on the trip page reflected.
--
-- Three columns, mirroring the ones a guide's checks already have: when, who,
-- and why. "Why" is the one that matters — "blurred, we cannot read the
-- number" is a document a trekker can replace in a minute; "rejected" on its
-- own is a support thread.
--
-- No check constraint tying rejected_at to verified_at being null: a document
-- rejected and then re-reviewed and passed is a real sequence, and the
-- timestamps say which happened last.

alter table booking_documents
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references users(id) on delete set null,
  add column if not exists rejected_reason text;

create index if not exists booking_documents_unreviewed_idx
  on booking_documents (created_at desc)
  where verified_at is null and rejected_at is null;

comment on column booking_documents.rejected_reason is
  'Said to the trekker verbatim, so it has to be a sentence they can act on:
   what is wrong with the document, not that it was rejected.';
