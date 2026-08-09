-- 0001 — Identity: users, guides, guide sub-tables. Plus RLS helpers.
-- Conventions (docs/03): uuid pks, created_at/updated_at, money as integer
-- cents(USD)/paisa(NPR), enums as text + check. RLS default-deny on every table.

-- Touch updated_at on write.
create or replace function public.touch_updated_at()
  returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---- users -----------------------------------------------------------------
create table users (
  id uuid primary key references auth.users(id),
  role text not null check (role in ('trekker','guide','ops')),
  email text,
  phone text,                          -- E.164
  full_name text not null,
  country_code text,                   -- trekker home country
  avatar_url text,
  emergency_contact_name text,         -- trekker only
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger users_touch before update on users
  for each row execute function public.touch_updated_at();

-- ---- RLS helpers -----------------------------------------------------------
-- Defined after users (SQL function bodies are validated against existing
-- objects at creation). SECURITY DEFINER so reading users inside a policy
-- doesn't recurse through the users RLS policy; search_path pinned.
create or replace function public.auth_role()
  returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_ops()
  returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'ops');
$$;

alter table users enable row level security;
-- self read/write own row; ops read all. (Guide→trekker name/country on shared
-- bookings is served via a dedicated projection in a later milestone, not here.)
create policy users_self_read on users for select using (id = auth.uid() or public.is_ops());
create policy users_self_insert on users for insert with check (id = auth.uid());
create policy users_self_update on users for update using (id = auth.uid() or public.is_ops());
create policy users_ops_all on users for all using (public.is_ops()) with check (public.is_ops());

-- ---- guides ----------------------------------------------------------------
create table guides (
  user_id uuid primary key references users(id),
  slug text unique not null,
  status text not null default 'applied'
    check (status in ('applied','in_review','verified','suspended','removed')),
  tier int not null default 0 check (tier between 0 and 3),
  licence_no text,
  licence_expiry date,
  home_district text,
  years_experience int,
  day_rate_usd_cents int,
  bio text,
  hook_line text,
  voice_intro_url text,
  payout_method text check (payout_method in ('esewa','khalti','bank')),
  payout_account text,
  payout_account_name text,
  response_rate numeric,
  median_response_mins int,
  treks_completed_platform int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger guides_touch before update on guides
  for each row execute function public.touch_updated_at();

-- Guides may edit their own commercial fields but NOT self-verify or self-promote.
-- Protected columns can only change via ops (or the service role, which bypasses RLS).
create or replace function public.guard_guide_columns()
  returns trigger language plpgsql as $$
begin
  if public.is_ops() then
    return new;
  end if;
  if new.status is distinct from old.status
     or new.tier is distinct from old.tier
     or new.slug is distinct from old.slug
     or new.licence_no is distinct from old.licence_no
     or new.treks_completed_platform is distinct from old.treks_completed_platform
     or new.response_rate is distinct from old.response_rate
     or new.median_response_mins is distinct from old.median_response_mins then
    raise exception 'guide may not modify verification/ranking columns';
  end if;
  return new;
end;
$$;
create trigger guides_guard before update on guides
  for each row execute function public.guard_guide_columns();

alter table guides enable row level security;
-- No anon access to the base table (payout/licence live here); public reads go
-- through the public_guides view (0009). Guide reads own row; ops all.
create policy guides_self_read on guides for select using (user_id = auth.uid() or public.is_ops());
create policy guides_self_apply on guides for insert with check (user_id = auth.uid() or public.is_ops());
create policy guides_self_update on guides for update using (user_id = auth.uid() or public.is_ops());
create policy guides_ops_all on guides for all using (public.is_ops()) with check (public.is_ops());

-- ---- guide_photos ----------------------------------------------------------
create table guide_photos (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  url text not null,
  kind text not null check (kind in ('headshot','trail','lifestyle')),
  alt_text text not null,              -- SEO-mandatory
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table guide_photos enable row level security;
create policy guide_photos_owner on guide_photos for all
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());
-- Public reads go through public_guides join; direct anon select not granted.

-- ---- guide_languages -------------------------------------------------------
create table guide_languages (
  guide_id uuid not null references guides(user_id),
  language text not null,
  proficiency text not null check (proficiency in ('basic','conversational','fluent','native')),
  primary key (guide_id, language)
);
alter table guide_languages enable row level security;
create policy guide_languages_owner on guide_languages for all
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());

-- ---- guide_verifications ---------------------------------------------------
create table guide_verifications (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  check_type text not null check (check_type in
    ('licence','id_match','phone','payout_account','reference_1','reference_2',
     'police_cert','first_aid','altitude_training','insurance')),
  status text not null default 'pending' check (status in ('pending','passed','failed','expired')),
  document_url text,                   -- private bucket path
  notes text,
  verified_by uuid references users(id),
  verified_at timestamptz,
  expires_at date,
  created_at timestamptz not null default now()
);
alter table guide_verifications enable row level security;
-- ops only (guide sees a status summary via a view in a later milestone).
create policy guide_verifications_ops on guide_verifications for all
  using (public.is_ops()) with check (public.is_ops());

-- ---- guide_strikes ---------------------------------------------------------
create table guide_strikes (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  reason text not null,
  booking_id uuid,
  issued_by uuid not null references users(id),
  created_at timestamptz not null default now()
);
alter table guide_strikes enable row level security;
create policy guide_strikes_read on guide_strikes for select
  using (guide_id = auth.uid() or public.is_ops());
create policy guide_strikes_ops_write on guide_strikes for all
  using (public.is_ops()) with check (public.is_ops());
