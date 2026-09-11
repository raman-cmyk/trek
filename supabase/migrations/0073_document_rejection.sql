-- Saying no to a document, and saying why.
--
-- Ops could verify a passport or an insurance policy and nothing else. A
-- blurry scan, a policy with no helicopter cover, a passport expiring before
-- the trek ends — all of those are ordinary, and the only way to handle one
-- was to leave it unverified and hope somebody thought to send a message. The
-- trekker's page said "checking" forever.
--
-- The reason is the point. A rejection nobody can act on is worse than none:
-- it has to reach the person who can fix it, in their own words.
alter table booking_documents
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists rejected_by uuid references users(id);

-- Insurance is not a file — it is fields on the booking, attested by the
-- trekker and checked by us — so its rejection lives beside its verification.
alter table bookings
  add column if not exists insurance_rejected_at timestamptz,
  add column if not exists insurance_rejected_reason text,
  add column if not exists insurance_rejected_by uuid references users(id);

-- A document is either settled or waiting, never both. Verifying clears a
-- rejection and rejecting clears a verification; the constraint is here so a
-- future code path cannot leave a row claiming both.
alter table booking_documents
  drop constraint if exists booking_documents_not_both;
alter table booking_documents
  add constraint booking_documents_not_both
  check (verified_at is null or rejected_at is null);

-- Rejecting without saying why is the failure this migration exists to
-- prevent, so the database refuses it too.
alter table booking_documents
  drop constraint if exists booking_documents_reason_required;
alter table booking_documents
  add constraint booking_documents_reason_required
  check (rejected_at is null or length(coalesce(rejected_reason, '')) >= 3);

alter table bookings
  drop constraint if exists bookings_insurance_reason_required;
alter table bookings
  add constraint bookings_insurance_reason_required
  check (
    insurance_rejected_at is null
    or length(coalesce(insurance_rejected_reason, '')) >= 3
  );
