-- 0058 — The package a guide actually proposes, and the extras a trekker picks.
--
-- The flow today has one shape: a trekker asks for a date and a party size,
-- and the guide can only say yes or no. Every real conversation about a trek
-- ends somewhere else — "we should add a day at Namche", "skip the domestic
-- flight, we'll take the bus", "there are three of us now". None of that could
-- be written down, so it happened over WhatsApp and the booking quietly stopped
-- describing the trip.
--
-- Two things fix it:
--
--   1. What the trekker ticked. Every offering already has optional lines —
--      gear hire, an extra acclimatisation day — and until now they were shown
--      as prices and never as choices. The enquiry now carries what was chosen.
--
--   2. A proposal. The guide adjusts days, party, which optional lines are in,
--      and can add a line of their own, then sends it back priced. The trekker
--      sees exactly what changed and what it costs, approves, and pays the
--      deposit. Nothing is booked and no money moves until they do.

alter table enquiries
  -- The optional line ids (and standard add-on keys) the trekker ticked on the
  -- offering page. What they asked for, before any negotiation.
  add column if not exists selected_options jsonb not null default '[]'::jsonb;

create table if not exists package_proposals (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references enquiries(id) on delete cascade,
  guide_id uuid not null references guides(user_id) on delete cascade,
  trekker_id uuid not null references users(id) on delete cascade,

  -- The trip being proposed. Days is on the proposal rather than read from the
  -- offering because changing the length is the commonest change there is.
  start_date date not null,
  days integer not null check (days between 1 and 60),
  party_size integer not null check (party_size between 1 and 24),

  -- The whole priced package, in the same shape an offering carries, so every
  -- reader downstream — checkout, the contract, the payout — prices it with the
  -- same function it already uses. A snapshot on purpose: editing the offering
  -- next month must not silently change a proposal somebody already approved.
  price_breakdown jsonb not null,
  total_usd_cents integer not null check (total_usd_cents >= 0),
  deposit_usd_cents integer not null check (deposit_usd_cents >= 0),

  -- What the guide said about it, in their own words.
  note text,

  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'declined', 'withdrawn', 'superseded')),
  -- Set when it turns into a real booking.
  booking_id uuid references bookings(id) on delete set null,

  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists package_proposals_enquiry_idx
  on package_proposals (enquiry_id, created_at desc);
create index if not exists package_proposals_trekker_idx
  on package_proposals (trekker_id, status);

alter table package_proposals enable row level security;

-- Both sides of the trip see it; ops sees everything. Nobody else: a proposal
-- names a person, a date and a price.
drop policy if exists package_proposals_participant_read on package_proposals;
create policy package_proposals_participant_read on package_proposals
  for select to authenticated
  using (trekker_id = auth.uid() or guide_id = auth.uid() or public.is_ops());

-- Only the guide proposes. The trekker's half of this conversation is
-- approving or declining, which is an update, not an insert.
drop policy if exists package_proposals_guide_insert on package_proposals;
create policy package_proposals_guide_insert on package_proposals
  for insert to authenticated
  with check (guide_id = auth.uid() or public.is_ops());

drop policy if exists package_proposals_participant_update on package_proposals;
create policy package_proposals_participant_update on package_proposals
  for update to authenticated
  using (trekker_id = auth.uid() or guide_id = auth.uid() or public.is_ops())
  with check (trekker_id = auth.uid() or guide_id = auth.uid() or public.is_ops());

notify pgrst, 'reload schema';
