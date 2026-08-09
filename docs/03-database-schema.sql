-- 03 — Database Schema (Supabase / Postgres)
-- This file is the reference. Actual changes ship as numbered migrations in /supabase/migrations.
-- Conventions: uuid pks (gen_random_uuid()), created_at/updated_at on all tables,
-- money as integer cents (usd) / paisa (npr), enums as text + check constraints (easier migrations).
-- RLS: default deny on every table. Policy summaries in comments; write full policies in migrations.

-- ============ IDENTITY ============

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
-- RLS: self read/write own row; ops read all; guides read trekker name+country on shared bookings via view.

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
  day_rate_usd_cents int,              -- floor/ceiling enforced in app layer
  bio text,                            -- written by ops copywriter
  hook_line text,                      -- one-line personality hook for cards
  voice_intro_url text,                -- optional 30s audio
  payout_method text check (payout_method in ('esewa','khalti','bank')),
  payout_account text,                 -- account id / number (masked in UI)
  payout_account_name text,            -- must match ID
  response_rate numeric,               -- computed nightly
  median_response_mins int,            -- computed nightly
  treks_completed_platform int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: public read WHERE status='verified' (via public view exposing safe columns only);
-- guide read own full row, update limited columns (day_rate, payout_*); ops all.

create table guide_photos (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  url text not null,
  kind text not null check (kind in ('headshot','trail','lifestyle')),
  alt_text text not null,              -- SEO-mandatory
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table guide_languages (
  guide_id uuid not null references guides(user_id),
  language text not null,
  proficiency text not null check (proficiency in ('basic','conversational','fluent','native')),
  primary key (guide_id, language)
);

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
  expires_at date,                     -- licences/certs expire; nightly job flips to 'expired'
  created_at timestamptz not null default now()
);
-- RLS: ops only. Guide sees status summary via view (no notes, no doc urls).

create table guide_strikes (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  reason text not null,
  booking_id uuid,
  issued_by uuid not null references users(id),
  created_at timestamptz not null default now()
);

-- ============ CATALOG ============

create table routes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,           -- 'everest-base-camp'
  name text not null,
  region text not null,
  typical_days int,
  max_altitude_m int,
  difficulty text check (difficulty in ('easy','moderate','hard','strenuous')),
  requires_licensed_guide boolean not null default true,
  season_months int[] not null,        -- {3,4,5,10,11}
  geojson jsonb,                       -- route line for maps
  created_at timestamptz not null default now()
);
-- RLS: public read.

create table permits (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id),
  name text not null,                  -- 'Sagarmatha NP Entry'
  cost_npr_paisa int not null,
  cost_usd_cents int not null,         -- what we charge trekker (rounded, updated with fx)
  issuing_body text,
  lead_time_days int not null default 3
);
-- Permit logic is DATA, not code — regulations change; ops edits rows, no deploys.

create table offerings (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  slug text unique not null,
  kind text not null check (kind in ('trek','day_hike','food_culture','adventure','city')),
  route_id uuid references routes(id), -- required when kind='trek'
  title text not null,
  summary text not null,
  days int not null default 1,
  price_usd_cents int,                 -- experiences: per person. treks: null (derived from day rate)
  max_party int not null default 7,    -- legal max per guide
  min_party int not null default 1,
  meeting_point text,
  included text[],
  excluded text[],
  itinerary jsonb,                     -- [{day:1, title, body}] or [{time, title, body}]
  cover_photo_url text,
  status text not null default 'draft' check (status in ('draft','live','paused')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- RLS: public read WHERE status='live' AND guide verified; guide CRUD own (publish gated by ops); ops all.
-- constraint: kind='trek' requires route_id + guide tier >= 1.

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

create table availability (
  guide_id uuid not null references guides(user_id),
  day date not null,
  status text not null default 'open' check (status in ('open','held','booked','blocked')),
  booking_id uuid,
  primary key (guide_id, day)
);
-- held = enquiry accepted, awaiting deposit (24h TTL, swept by cron).

-- ============ TRANSACTION ============

create table enquiries (
  id uuid primary key default gen_random_uuid(),
  trekker_id uuid not null references users(id),
  guide_id uuid not null references guides(user_id),
  offering_id uuid not null references offerings(id),
  start_date date not null,
  party_size int not null,
  message text,
  status text not null default 'open'
    check (status in ('open','quoted','accepted','declined','expired','converted')),
  expires_at timestamptz not null,     -- now() + 24h
  created_at timestamptz not null default now()
);
-- RLS: trekker own; guide own; ops all.

create table bookings (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid references enquiries(id),
  trekker_id uuid not null references users(id),
  guide_id uuid not null references guides(user_id),
  offering_id uuid not null references offerings(id),
  start_date date not null,
  end_date date not null,
  party_size int not null,
  status text not null default 'pending_deposit' check (status in
    ('pending_deposit','deposit_paid','docs_pending','confirmed',   -- confirmed = balance paid + insurance verified
     'active','completed','cancelled_trekker','cancelled_guide','cancelled_force_majeure')),
  -- money snapshot (immutable after deposit)
  guide_fee_usd_cents int not null,
  porter_fee_usd_cents int not null default 0,
  permit_fees_usd_cents int not null default 0,
  service_fee_usd_cents int not null,
  permit_handling_usd_cents int not null default 0,
  total_usd_cents int not null,
  commission_usd_cents int not null,   -- platform's 15% of guide+porter
  fx_rate_npr numeric not null,        -- snapshotted at booking
  guide_payout_npr_paisa int not null, -- fixed at booking
  deposit_usd_cents int not null,
  deposit_paid_at timestamptz,
  balance_paid_at timestamptz,
  completed_confirmed_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table booking_documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  person_name text not null,           -- multi-party bookings: one set per trekker
  type text not null check (type in ('passport','insurance')),
  storage_path text not null,          -- private bucket
  verified_by uuid references users(id),
  verified_at timestamptz,
  delete_after date,                   -- completion + 90d, set on completion
  created_at timestamptz not null default now()
);

create table document_access_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references booking_documents(id),
  accessed_by uuid not null references users(id),
  accessed_at timestamptz not null default now()
);

create table permit_applications (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  permit_id uuid not null references permits(id),
  status text not null default 'awaiting_docs'
    check (status in ('awaiting_docs','filed','approved','ready','rejected')),
  reference_no text,
  filed_at timestamptz,
  approved_at timestamptz,
  notes text
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  stripe_payment_intent text,
  stripe_refund_id text,
  type text not null check (type in ('deposit','balance','full','refund')),
  amount_usd_cents int not null,       -- refunds negative
  status text not null check (status in ('pending','succeeded','failed')),
  created_at timestamptz not null default now()
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id),
  booking_id uuid not null references bookings(id),
  amount_npr_paisa int not null,
  method text not null,
  batch_ref text,                      -- ops batch id
  receipt_url text,
  status text not null default 'payable' check (status in ('payable','paid')),
  paid_at timestamptz,
  paid_by uuid references users(id)
);

-- ============ GROUP DEPARTURES (Phase 2 — schema now, UI later) ============

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

create table departure_members (
  departure_id uuid not null references departures(id),
  booking_id uuid not null references bookings(id),
  primary key (departure_id, booking_id)
);

-- ============ SAFETY ============

create table checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  day date not null,
  method text not null check (method in ('app','sms')),
  note text,
  photo_url text,                      -- feeds "on the trail now" (approved flag via offering_photos pattern)
  photo_approved boolean not null default false,
  received_at timestamptz not null default now(),
  unique (booking_id, day)
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  severity text not null check (severity in ('L1','L2','L3')),
  summary text not null,
  timeline jsonb not null default '[]', -- [{at, actor, action}]
  status text not null default 'open' check (status in ('open','monitoring','closed')),
  opened_by uuid not null references users(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
-- RLS: ops only.

-- ============ SOCIAL ============

create table messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid references enquiries(id),
  booking_id uuid references bookings(id),
  sender_id uuid not null references users(id),
  body text not null,                  -- original
  body_rendered text not null,         -- masked version pre-deposit
  flagged_reason text,                 -- 'phone','email','platform_bypass'
  created_at timestamptz not null default now(),
  check (enquiry_id is not null or booking_id is not null)
);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  author_id uuid not null references users(id),
  subject_id uuid not null references users(id),
  direction text not null check (direction in ('trekker_to_guide','guide_to_trekker')),
  overall int not null check (overall between 1 and 5),
  sub_ratings jsonb not null,          -- keys per direction, validated in app
  body text,
  published_at timestamptz,            -- null until double-blind release
  guide_reply text,
  created_at timestamptz not null default now(),
  unique (booking_id, direction)
);
-- RLS: public read WHERE published_at is not null (trekker_to_guide only exposes to public);
-- author write own before publish; ops moderate.

create table recaps (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique not null references bookings(id),
  slug text unique not null,           -- public shareable url
  photo_urls text[],
  stats jsonb,                         -- {days, max_altitude_m, distance_km}
  visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ CONTENT / SEO ============

create table redirects (
  from_path text primary key,
  to_path text not null
);

-- ============ VIEWS (public-safe projections) ============
-- public_guides: verified guides, safe columns only (no phone, no payout, no licence full number)
-- public_offerings: live offerings joined to public_guides
-- Define in migrations with security_invoker=false and grant anon select on views only.

-- ============ INDEXES (minimum set) ============
create index on offerings (kind, status);
create index on offerings (guide_id) where status = 'live';
create index on enquiries (guide_id, status);
create index on enquiries (expires_at) where status = 'open';
create index on bookings (guide_id, status);
create index on bookings (trekker_id, status);
create index on bookings (status, start_date);
create index on availability (guide_id, day);
create index on checkins (booking_id, day);
create index on reviews (subject_id) where published_at is not null;
create index on payouts (status);
create index on messages (flagged_reason) where flagged_reason is not null;
