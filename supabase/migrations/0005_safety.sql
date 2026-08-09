-- 0005 — Safety: check-ins and incidents.

create table checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  day date not null,
  method text not null check (method in ('app','sms')),
  note text,
  photo_url text,
  photo_approved boolean not null default false,
  received_at timestamptz not null default now(),
  unique (booking_id, day)
);
alter table checkins enable row level security;
-- Booking participants read; the guide records app check-ins; ops all.
create policy checkins_read on checkins for select using (
  public.is_ops()
  or exists (select 1 from bookings b where b.id = booking_id
             and (b.trekker_id = auth.uid() or b.guide_id = auth.uid()))
);
create policy checkins_guide_create on checkins for insert with check (
  exists (select 1 from bookings b where b.id = booking_id and b.guide_id = auth.uid())
);
create policy checkins_ops_write on checkins for all
  using (public.is_ops()) with check (public.is_ops());

create table incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  severity text not null check (severity in ('L1','L2','L3')),
  summary text not null,
  timeline jsonb not null default '[]',
  status text not null default 'open' check (status in ('open','monitoring','closed')),
  opened_by uuid not null references users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
alter table incidents enable row level security;
-- ops only.
create policy incidents_ops on incidents for all
  using (public.is_ops()) with check (public.is_ops());
