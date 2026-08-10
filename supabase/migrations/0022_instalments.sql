-- 0022 — Interest-free instalments (Feature Pack v3 §1d). The trekker chooses at
-- checkout how many equal payments to split the balance into; all fall before
-- departure. Generated on deposit success. No interest.

alter table bookings add column instalment_count int not null default 1;

create table instalments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  seq int not null,
  amount_usd_cents int not null,
  due_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, seq)
);
alter table instalments enable row level security;
-- Ops + the booking's trekker/guide can read the schedule.
create policy instalments_participant on instalments for select using (
  public.is_ops()
  or exists (
    select 1 from bookings b
    where b.id = instalments.booking_id
      and (b.trekker_id = auth.uid() or b.guide_id = auth.uid())
  )
);
create index instalments_booking_idx on instalments(booking_id);
