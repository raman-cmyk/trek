-- 0018 — Insurance attestation + in-app blue TIMS card (2026 rules).
--
-- Nepal 2026: the green independent-trekker TIMS is gone; only the agency-issued
-- BLUE card exists, and it's gated on insurance covering high-altitude trekking
-- and helicopter evacuation. As a TAAN-registered agency we issue the blue card
-- in-flow — a functional moat an aggregator can't copy.

-- Insurance self-attestation (from the /insurance checker) + ops verification.
alter table bookings
  add column insurance_provider text,
  add column insurance_policy_no text,
  add column insurance_meta jsonb,
  add column insurance_attested_at timestamptz,
  add column insurance_verified_at timestamptz;

-- The blue TIMS card, issued per booking by ops once insurance + docs check out.
create table tims_cards (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique not null references bookings(id) on delete cascade,
  card_no text unique not null,
  trekker_name text not null,
  nationality text,
  guide_name text,
  guide_licence_no text,
  route_name text,
  region text,
  entry_point text,
  start_date date,
  end_date date,
  party_size int,
  issued_by uuid references users(id),
  issued_at timestamptz not null default now(),
  status text not null default 'issued' check (status in ('issued','void'))
);
alter table tims_cards enable row level security;
-- Ops manage; the trekker and their guide can read the card for their booking.
create policy tims_ops_all on tims_cards for all
  using (public.is_ops()) with check (public.is_ops());
create policy tims_party_read on tims_cards for select using (
  exists (
    select 1 from bookings b
    where b.id = tims_cards.booking_id
      and (b.trekker_id = auth.uid() or b.guide_id = auth.uid())
  )
);

create index tims_cards_booking_idx on tims_cards(booking_id);
