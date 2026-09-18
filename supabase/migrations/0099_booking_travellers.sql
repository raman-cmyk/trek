-- 0099 — the people actually going on the trip.
--
-- `party_size` is an integer. Nobody on a booking has a name except the
-- account holder, and every document upload asks "whose is it?" as free text,
-- typed fresh each time and slugged into the storage path. So:
--
--   * one party of 1 in production carries 3 passports and 3 insurance files;
--   * another carries 3 passports;
--   * `docsSettled` asks only "is there at least one live document and is
--     every live one verified", which does not look at the document TYPE or
--     at how many people are going. One verified passport and no insurance at
--     all confirms a booking for six people, and confirming fires the permit
--     trigger.
--
-- None of that is fixable by counting, because "Jon Smith" and "jon smith" are
-- two different people to a count. It needs the roster the product has been
-- promising all along: the upload panel already says "One for each person
-- going" over a form with no per-person model behind it.
--
-- The lead traveller is seeded from the account holder, so a solo trekker
-- confirms a name already there rather than typing their own.

create table if not exists booking_travellers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  -- As printed on the passport, which is not always what somebody calls
  -- themselves — the permit counter reads the passport.
  full_name text not null check (length(btrim(full_name)) >= 2),
  is_lead boolean not null default false,
  passport_expiry date,
  added_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index if not exists booking_travellers_booking_idx
  on booking_travellers (booking_id);

-- One lead per booking: the person the trip is booked under, and the one an
-- incident call starts with.
create unique index if not exists booking_travellers_one_lead
  on booking_travellers (booking_id) where is_lead;

alter table booking_travellers enable row level security;

-- Mirrors booking_documents exactly (0003): ops and the owning trekker, and
-- guides never. A guide does not need the passport names of the party to walk
-- with them, and the rule that keeps documents away from guides should not
-- have a side door.
drop policy if exists booking_travellers_access on booking_travellers;
create policy booking_travellers_access on booking_travellers for select using (
  public.is_ops()
  or exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);

drop policy if exists booking_travellers_trekker_write on booking_travellers;
create policy booking_travellers_trekker_write on booking_travellers for insert with check (
  exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);

-- The trekker may correct a name they typed. Whether a traveller can be
-- removed once a verified document hangs off them is a question for the
-- action, not for RLS — the answer is no, and it needs to say why.
drop policy if exists booking_travellers_trekker_edit on booking_travellers;
create policy booking_travellers_trekker_edit on booking_travellers for update using (
  exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
) with check (
  exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);

drop policy if exists booking_travellers_trekker_delete on booking_travellers;
create policy booking_travellers_trekker_delete on booking_travellers for delete using (
  exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);

drop policy if exists booking_travellers_ops_write on booking_travellers;
create policy booking_travellers_ops_write on booking_travellers for all
  using (public.is_ops()) with check (public.is_ops());

-- ── documents belong to a person ────────────────────────────────────────
--
-- Nullable, because 21 documents already exist and 0100 attaches them. Once
-- attached, the partial unique index is what makes a second passport for the
-- same person a REPLACEMENT rather than a third row in the list: live rows
-- only, so a rejected document steps aside for the one that replaces it.
alter table booking_documents
  add column if not exists traveller_id uuid references booking_travellers(id) on delete set null;

create unique index if not exists booking_documents_one_live_per_traveller
  on booking_documents (booking_id, traveller_id, type)
  where rejected_at is null and traveller_id is not null;

comment on table booking_travellers is
  'The named people on a booking. One document of each type per traveller
   (0099); party_size alone could not express that and could not tell two
   spellings of one name apart.';
