-- 0004 — Group departures (Phase 2 — schema now, UI later; docs/BACKLOG.md).

create table departures (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  offering_id uuid not null references offerings(id),
  start_date date not null,
  slots_total int not null,
  min_viable int not null default 3,
  price_pp_usd_cents int not null,
  status text not null default 'open' check (status in ('open','confirmed','cancelled','completed')),
  created_at timestamptz not null default now()
);
alter table departures enable row level security;
-- Open departures are publicly browsable (Phase 2 UI); guide/ops manage.
create policy departures_public_read on departures for select
  using (status = 'open' or guide_id = auth.uid() or public.is_ops());
create policy departures_owner_write on departures for all
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());

create table departure_members (
  departure_id uuid not null references departures(id),
  booking_id uuid not null references bookings(id),
  primary key (departure_id, booking_id)
);
alter table departure_members enable row level security;
create policy departure_members_read on departure_members for select using (
  public.is_ops()
  or exists (select 1 from bookings b where b.id = booking_id
             and (b.trekker_id = auth.uid() or b.guide_id = auth.uid()))
);
create policy departure_members_ops_write on departure_members for all
  using (public.is_ops()) with check (public.is_ops());
