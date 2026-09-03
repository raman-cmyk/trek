-- 0048 — Where a guide's verification papers actually live.
--
-- Until now a verification check held one free-text `document_url` and nothing
-- else: no file size, no mime type, no who-uploaded-it, no expiry, no second
-- page of a two-page licence, and no record of who opened it. A passport scan
-- and a police clearance were stored with less care than an offering photo.
--
-- This gives guide papers the same treatment trekker passports already get:
-- rows carrying real metadata, files in the private `documents` bucket that
-- only the service role can reach, every view served by a 10-minute signed URL
-- and written to the access log, and a deletion date so nothing is kept
-- forever. Same bucket, same rules, one policy surface to reason about.

-- ---- guide_documents -------------------------------------------------------
create table if not exists guide_documents (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id) on delete cascade,
  -- Which check it proves. Nullable: a guide sends a paper before anyone has
  -- decided which box it ticks, and that paper should still be filed.
  verification_id uuid references guide_verifications(id) on delete set null,
  kind text not null check (kind in (
    'licence','id_card','passport','police_cert','first_aid',
    'altitude_training','insurance','payout_proof','reference_letter','other'
  )),
  label text,                                  -- what the office called it
  storage_path text not null unique,           -- private bucket, never rendered
  mime_type text not null,
  size_bytes int not null check (size_bytes > 0),
  original_name text,
  issued_on date,
  -- A first-aid certificate that lapsed is not a passed check. Stored on the
  -- document so the ops page can say "expires in 3 weeks" without a join.
  expires_on date,
  uploaded_by uuid not null references users(id),
  uploaded_at timestamptz not null default now(),
  -- Set when a guide leaves; the nightly retention sweep removes the file.
  delete_after date
);

create index if not exists guide_documents_guide_idx
  on guide_documents (guide_id, uploaded_at desc);
create index if not exists guide_documents_expiry_idx
  on guide_documents (expires_on) where expires_on is not null;
create index if not exists guide_documents_retention_idx
  on guide_documents (delete_after) where delete_after is not null;

alter table guide_documents enable row level security;

-- Ops handle them. A guide may see the list of what we hold about them —
-- knowing "Trek has my licence, it expires next March" is their right — but
-- reading a file still needs a server-issued signed URL, which only ops routes
-- mint. Nobody else, at any tier, sees that a document exists.
create policy guide_documents_ops on guide_documents for all
  using (public.is_ops()) with check (public.is_ops());
create policy guide_documents_owner_read on guide_documents for select
  using (guide_id = auth.uid());

-- ---- the access log covers both kinds of document ---------------------------
-- One log, so "who looked at whose papers" is a single question with a single
-- answer. document_id stays for trekker documents; exactly one target is set.
alter table document_access_log alter column document_id drop not null;
alter table document_access_log
  add column if not exists guide_document_id uuid references guide_documents(id) on delete cascade;
alter table document_access_log
  add column if not exists purpose text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_access_log_one_target'
  ) then
    alter table document_access_log add constraint document_access_log_one_target
      check (num_nonnulls(document_id, guide_document_id) = 1);
  end if;
end $$;

create index if not exists document_access_log_guide_doc_idx
  on document_access_log (guide_document_id, accessed_at desc);

-- ---- carry the old free-text paths across -----------------------------------
-- The size and mime are unknown for these; recorded as zero-unknown would fail
-- the check, so they carry a placeholder mime and 1 byte and are marked in the
-- label. Nothing is lost and nothing is invented.
insert into guide_documents (
  guide_id, verification_id, kind, label, storage_path, mime_type, size_bytes,
  uploaded_by, uploaded_at
)
select
  v.guide_id,
  v.id,
  case v.check_type
    when 'licence' then 'licence'
    when 'police_cert' then 'police_cert'
    when 'first_aid' then 'first_aid'
    when 'altitude_training' then 'altitude_training'
    when 'insurance' then 'insurance'
    when 'id_match' then 'id_card'
    when 'payout_account' then 'payout_proof'
    when 'reference_1' then 'reference_letter'
    when 'reference_2' then 'reference_letter'
    else 'other'
  end,
  'Migrated from the old single-file field',
  v.document_url,
  'application/octet-stream',
  1,
  coalesce(v.verified_by, v.guide_id),
  coalesce(v.verified_at, v.created_at)
from guide_verifications v
where v.document_url is not null
  and v.document_url <> ''
on conflict (storage_path) do nothing;

comment on column guide_verifications.document_url is
  'Legacy single-file field. Superseded by guide_documents; kept for backfill history, not written to.';

-- ---- retention --------------------------------------------------------------
-- A guide who has left keeps their papers on our disk for 90 days, in case the
-- removal is disputed or a licence body asks, and then they go. Reinstating a
-- guide clears the date, so a suspension that is lifted does not quietly cost
-- them their file.
create or replace function public.stamp_guide_document_retention()
  returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'removed' and old.status is distinct from 'removed' then
    update guide_documents
      set delete_after = current_date + 90
      where guide_id = new.user_id and delete_after is null;
  elsif old.status = 'removed' and new.status is distinct from 'removed' then
    update guide_documents set delete_after = null where guide_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists guides_document_retention on guides;
create trigger guides_document_retention after update on guides
  for each row execute function public.stamp_guide_document_retention();
