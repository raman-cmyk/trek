-- 0040 — Events: anyone can propose one, the office says yes, they build it.
--
-- Today the only way something gets listed is for a verified guide to create
-- an offering. But a lot of real trips do not start with a guide — they start
-- with a person. A photographer who wants to take eight people to Gokyo in
-- November. A yoga teacher running a week in Langtang. An alumni group doing
-- Poon Hill. They have the group; what they lack is permits, a guide, and
-- somewhere to be found.
--
-- So: a proposal anybody signed in can send, an accept/decline by the office,
-- and then the proposer fills in the detail and it goes live. The office is in
-- the loop at exactly two points — the accept, and the publish — because a
-- stranger's trek carrying our name is the one thing that cannot be
-- self-serve.
--
--   draft      being written by the proposer, nobody else can see it
--   submitted  waiting for the office
--   accepted   the office said yes; the proposer is filling in the detail
--   review     the proposer says it is ready
--   live       published, visible, joinable
--   declined   the office said no, with a reason
--   cancelled  called off by either side
--
-- Events are deliberately NOT offerings. An offering belongs to one verified
-- guide and prices per person off a breakdown; an event belongs to a member of
-- the public, has fixed dates, a hard cap, and a guide assigned by us. Forcing
-- them into the same table would put nullable columns through the booking
-- engine, which is the one part of this product that must stay boring.

create table events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,

  -- Who is organising. Not a guide — anyone with an account.
  organiser_id uuid not null references users(id) on delete cascade,
  contact_phone text,

  status text not null default 'draft'
    check (status in ('draft','submitted','accepted','review','live','declined','cancelled')),

  -- The pitch. This is all the office needs to say yes or no.
  title text not null check (length(btrim(title)) between 3 and 120),
  pitch text,
  route_id uuid references routes(id) on delete set null,
  region text,
  start_date date,
  end_date date,
  max_people integer not null default 8 check (max_people between 2 and 40),
  price_usd_cents integer check (price_usd_cents is null or price_usd_cents >= 0),

  -- Filled in after the office accepts.
  summary text,
  itinerary jsonb not null default '[]'::jsonb,
  included text,
  excluded text,
  meeting_point text,
  cover_photo_url text,
  photos jsonb not null default '[]'::jsonb,

  -- The office's side.
  guide_id uuid references guides(user_id) on delete set null,
  ops_note text,
  decline_reason text,
  reviewed_by uuid references users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A live event has to be answerable: when, how many, who leads it.
  constraint events_live_is_complete check (
    status <> 'live'
    or (start_date is not null and end_date is not null and guide_id is not null
        and summary is not null and cover_photo_url is not null)
  ),
  constraint events_dates_ordered check (end_date is null or start_date is null or end_date >= start_date)
);

create index events_status_idx on events (status, start_date);
create index events_organiser_idx on events (organiser_id);

-- Who is coming. Joining is free and non-binding at this stage: an event that
-- never fills is cancelled, and taking money for it first would be the wrong
-- way round.
create table event_signups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  party_size integer not null default 1 check (party_size between 1 and 12),
  note text,
  status text not null default 'interested'
    check (status in ('interested','confirmed','withdrawn')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create index event_signups_event_idx on event_signups (event_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table events enable row level security;
alter table event_signups enable row level security;

-- Read: a live event is public. Anything earlier is the organiser's and ops'.
create policy events_public_read on events
  for select using (status = 'live');

create policy events_own_read on events
  for select to authenticated
  using (organiser_id = auth.uid() or is_ops());

create policy events_insert on events
  for insert to authenticated with check (organiser_id = auth.uid());

-- The organiser may edit their own until it is live; after that the office
-- holds the pen, because the page is carrying our name by then.
create policy events_organiser_update on events
  for update to authenticated
  using (organiser_id = auth.uid() and status in ('draft','submitted','accepted','review'))
  with check (organiser_id = auth.uid() and status in ('draft','submitted','accepted','review'));

create policy events_ops_all on events
  for all to authenticated using (is_ops()) with check (is_ops());

create policy event_signups_read on event_signups
  for select to authenticated
  using (
    user_id = auth.uid()
    or is_ops()
    or exists (select 1 from events e where e.id = event_id and e.organiser_id = auth.uid())
  );

create policy event_signups_insert on event_signups
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from events e where e.id = event_id and e.status = 'live')
  );

create policy event_signups_own_update on event_signups
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy event_signups_ops on event_signups
  for all to authenticated using (is_ops()) with check (is_ops());

-- ---------------------------------------------------------------------------
-- The public shape
-- ---------------------------------------------------------------------------
-- Live events only, with the organiser's first name (not their surname — the
-- same rule the rest of the site follows) and how many places are left.

create or replace view public_events as
  select
    e.id,
    e.slug,
    e.title,
    e.summary,
    e.pitch,
    e.start_date,
    e.end_date,
    e.max_people,
    e.price_usd_cents,
    e.region,
    e.itinerary,
    e.included,
    e.excluded,
    e.meeting_point,
    e.cover_photo_url,
    e.photos,
    e.published_at,
    split_part(btrim(ou.full_name), ' ', 1) as organiser_name,
    ou.avatar_url as organiser_avatar_url,
    e.route_id,
    r.slug as route_slug,
    r.name as route_name,
    e.guide_id,
    g.slug as guide_slug,
    split_part(btrim(gu.full_name), ' ', 1) as guide_name,
    gu.avatar_url as guide_avatar_url,
    coalesce((
      select sum(s.party_size) from event_signups s
      where s.event_id = e.id and s.status in ('interested','confirmed')
    ), 0)::int as taken
  from events e
  join users ou on ou.id = e.organiser_id
  left join routes r on r.id = e.route_id
  left join guides g on g.user_id = e.guide_id
  left join users gu on gu.id = e.guide_id
  where e.status = 'live';

grant select on public_events to anon, authenticated;
