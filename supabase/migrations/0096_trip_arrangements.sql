-- 0096 — everything the office books for a trip that is not the guide.
--
-- A trek is not only a guide and a permit. Somebody hires the down jacket and
-- the sleeping bag, books the teahouse in Kathmandu the night before, puts a
-- jeep on the road to Soti Khola and a Buddha Air seat back from Lukla — and
-- until now every one of those lived in a WhatsApp thread, a notebook, or one
-- person's memory. The booking page could tell you a trek was "confirmed"
-- while nobody had yet booked the bus that gets them to the trailhead.
--
-- One table rather than four, because the office does the same five things to
-- each of them: decide it is needed, book it, record what it cost, pay for
-- it, and be able to find the reference number at six in the morning. A jeep
-- and a down jacket differ only in `kind`.
--
-- Money is integers with the currency beside it (CLAUDE.md #3). These are
-- local vendors paid in rupees, but a Lukla flight sold in dollars is a real
-- case, so the column is there rather than assumed.

create table if not exists trip_arrangements (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,

  -- What sort of thing this is. 'other' is deliberate: the office should be
  -- able to write down a thing we have not thought of rather than leave it
  -- off the trip because the form has no box for it.
  kind text not null check (kind in ('gear', 'hotel', 'transport', 'permit_agent', 'other')),

  -- In the office's own words: "Jeep, Kathmandu → Soti Khola", "Down jacket
  -- ×2, Shona's", "Hotel Ganesh Himal, night before".
  title text not null,
  vendor text,
  -- Ticket number, booking reference, the thing you read out on the phone.
  reference text,

  -- The day the arrangement itself happens (the flight, the night, the pickup).
  happens_on date,

  status text not null default 'to_book'
    check (status in ('to_book', 'booked', 'paid', 'cancelled')),

  currency text not null default 'NPR',
  cost_minor integer not null default 0 check (cost_minor >= 0),
  paid_minor integer not null default 0 check (paid_minor >= 0),
  -- When the office has to have paid the vendor, which is rarely the day the
  -- thing happens — a flight wants paying weeks before it flies.
  due_on date,

  note text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists trip_arrangements_booking_idx
  on trip_arrangements (booking_id, happens_on);

-- Overdue vendor payments across every trip, which is the one query the
-- office runs that does not start from a booking.
create index if not exists trip_arrangements_due_idx
  on trip_arrangements (due_on)
  where status <> 'cancelled' and status <> 'paid';

alter table trip_arrangements enable row level security;

-- Default deny, then the office. A trekker does not need to see what we paid
-- the jeep driver, and a guide's view of their own trip's logistics is a
-- later decision rather than one made by leaving the door open now.
drop policy if exists trip_arrangements_ops_all on trip_arrangements;
create policy trip_arrangements_ops_all on trip_arrangements
  for all using (public.is_ops()) with check (public.is_ops());

comment on table trip_arrangements is
  'Gear hire, hotels, transport and agency work booked by the office for one
   trip. One row per thing booked; status walks to_book -> booked -> paid.';
