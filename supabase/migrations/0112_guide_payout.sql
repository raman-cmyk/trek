-- 0112 — the columns a Nepali payout actually needs, and a PAN after the fact.
--
-- Payouts are made by hand, in NPR, by a person reading a screen and typing a
-- number into a banking app. Until now the guide's side of that was one
-- free-text column, `payout_account`, serving an eSewa number and a bank
-- account alike — with nowhere to record which bank, or which branch, which
-- is most of what a Nepali transfer needs. Twelve payouts are outstanding and
-- none has ever been marked paid.
--
-- `pan_number` is the other half of 0109. That migration took the PAN card
-- out of the verification a guide faces before they are let in — it is a tax
-- number, and it says nothing about whether somebody is safe to walk a
-- stranger to 5,364m. `guide-checks.ts` gained an AFTER_VERIFIED list for it
-- and nothing has ever read that list, because a verified guide had nowhere
-- to put a PAN. This is that somewhere.
--
-- No data is written and nothing is backfilled.

alter table guides add column if not exists payout_bank_name text;
alter table guides add column if not exists payout_branch text;
alter table guides add column if not exists pan_number text;

comment on column guides.payout_bank_name is
  'Bank the account is held at. Only meaningful when payout_method = ''bank''.';
comment on column guides.payout_branch is
  'Branch, as the guide writes it. Only meaningful when payout_method = ''bank''.';
comment on column guides.pan_number is
  'Nepali PAN, nine digits. Asked for only after verification and blocking '
  'nothing — see AFTER_VERIFIED in app/lib/guide-checks.ts.';

-- A guide may now send us the PAN card itself, so it becomes a kind of paper
-- we file rather than an "other" with a label. Keep in step with
-- GUIDE_DOC_KINDS in app/lib/guide-documents.ts.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'guide_documents_kind_check'
  ) then
    alter table guide_documents drop constraint guide_documents_kind_check;
  end if;
end $$;

alter table guide_documents add constraint guide_documents_kind_check
  check (kind in (
    'licence','id_card','passport','police_cert','first_aid',
    'altitude_training','insurance','payout_proof','pan_card',
    'reference_letter','other'
  ));

-- The QR is simply the newest payout_proof row for that guide, so this is the
-- lookup the money page and the ops ledger both make.
create index if not exists guide_documents_guide_kind_idx
  on guide_documents (guide_id, kind, uploaded_at desc);
