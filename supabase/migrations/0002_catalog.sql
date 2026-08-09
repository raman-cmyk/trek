-- 0002 — Catalog: routes, permits, offerings, offering_photos, availability.

-- ---- routes ----------------------------------------------------------------
create table routes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  region text not null,
  typical_days int,
  max_altitude_m int,
  difficulty text check (difficulty in ('easy','moderate','hard','strenuous')),
  requires_licensed_guide boolean not null default true,
  season_months int[] not null,
  geojson jsonb,
  created_at timestamptz not null default now()
);
alter table routes enable row level security;
-- Public reference data — anon may read directly (route pages, permit tables).
create policy routes_public_read on routes for select using (true);
create policy routes_ops_write on routes for all using (public.is_ops()) with check (public.is_ops());

-- ---- permits ---------------------------------------------------------------
-- Permit logic is DATA, not code — ops edits rows, no deploys (docs/03).
create table permits (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  name text not null,
  cost_npr_paisa int not null,
  cost_usd_cents int not null,
  issuing_body text,
  lead_time_days int not null default 3
);
alter table permits enable row level security;
create policy permits_public_read on permits for select using (true);
create policy permits_ops_write on permits for all using (public.is_ops()) with check (public.is_ops());

-- ---- offerings -------------------------------------------------------------
create table offerings (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  slug text unique not null,
  kind text not null check (kind in ('trek','day_hike','food_culture','adventure','city')),
  route_id uuid references routes(id),
  title text not null,
  summary text not null,
  days int not null default 1,
  price_usd_cents int,                 -- experiences: per person; treks: null
  max_party int not null default 7,
  min_party int not null default 1,
  meeting_point text,
  included text[],
  excluded text[],
  itinerary jsonb,
  cover_photo_url text,
  status text not null default 'draft' check (status in ('draft','live','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- kind='trek' requires a route (guide-tier >= 1 enforced in the app/ops layer).
  constraint trek_requires_route check (kind <> 'trek' or route_id is not null)
);
create trigger offerings_touch before update on offerings
  for each row execute function public.touch_updated_at();

-- Publishing is gated by ops: a guide may not set status='live' themselves.
create or replace function public.guard_offering_publish()
  returns trigger language plpgsql as $$
begin
  if public.is_ops() or current_user in ('service_role','supabase_admin','postgres') then
    return new;
  end if;
  if new.status = 'live' then
    if tg_op = 'INSERT' then
      raise exception 'publishing an offering (status=live) is gated by ops';
    elsif tg_op = 'UPDATE' and old.status is distinct from 'live' then
      raise exception 'publishing an offering (status=live) is gated by ops';
    end if;
  end if;
  return new;
end;
$$;
create trigger offerings_guard_insert before insert on offerings
  for each row execute function public.guard_offering_publish();
create trigger offerings_guard_update before update on offerings
  for each row execute function public.guard_offering_publish();

alter table offerings enable row level security;
-- Public reads go through public_offerings (0009). Guide CRUD own; ops all.
create policy offerings_owner_read on offerings for select
  using (guide_id = auth.uid() or public.is_ops());
create policy offerings_owner_write on offerings for all
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());

-- ---- offering_photos -------------------------------------------------------
create table offering_photos (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id),
  url text not null,
  alt_text text not null,
  credit_name text,                    -- 'Sarah, Berlin' for trekker photos
  source text not null default 'guide' check (source in ('guide','trekker','ops')),
  approved boolean not null default false,  -- moderation gate
  sort int not null default 0
);
alter table offering_photos enable row level security;
-- Approved photos are readable by anyone (offering detail pages); the owning
-- guide and ops see all (including unapproved) and can write.
create policy offering_photos_read on offering_photos for select using (
  approved
  or public.is_ops()
  or exists (select 1 from offerings o where o.id = offering_id and o.guide_id = auth.uid())
);
create policy offering_photos_write on offering_photos for all using (
  public.is_ops()
  or exists (select 1 from offerings o where o.id = offering_id and o.guide_id = auth.uid())
) with check (
  public.is_ops()
  or exists (select 1 from offerings o where o.id = offering_id and o.guide_id = auth.uid())
);

-- ---- availability ----------------------------------------------------------
create table availability (
  guide_id uuid not null references guides(user_id),
  day date not null,
  status text not null default 'open' check (status in ('open','held','booked','blocked')),
  booking_id uuid,
  primary key (guide_id, day)
);
alter table availability enable row level security;
-- Trekkers read calendars (to pick dates); guide/ops manage.
create policy availability_public_read on availability for select using (true);
create policy availability_owner_write on availability for all
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());
