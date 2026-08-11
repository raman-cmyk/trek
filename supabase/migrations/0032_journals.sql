-- 0032 — Trek Journals: one blog-style album per completed trek.
--
-- The thesis: a guide is proven by his body of work, not his bio. A journal is
-- the unit of proof for the whole marketplace, so the schema's job is to make
-- fake ones hard and consent violations impossible, not to be flexible.
--
-- Two constraints carry that:
--   1. journals_real_trip — every journal hangs off a completed booking, or is
--      explicitly flagged as a verified pre-platform trek by ops. There is no
--      third option, because one composite "sample" journal poisons every real
--      one on the platform.
--   2. Consent is enforced in the PUBLIC VIEW, not in page code. A missing
--      client_names_ok can then never leak a name through a route we forgot
--      to check — the anon role simply cannot select the column's contents.

create table journals (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  guide_id uuid not null references guides(user_id) on delete cascade,
  route_id uuid references routes(id),

  -- Proof this trip happened. Exactly one of these must hold.
  booking_id uuid references bookings(id),
  pre_platform boolean not null default false,
  pre_platform_note text,

  title text not null,
  start_date date not null,
  end_date date not null,

  -- Real first names + country, e.g. "Jef & Simon, BE". Only ever published
  -- when client_names_ok; group_anon is what shows otherwise.
  group_label text,
  group_anon text,

  max_altitude_m int,
  distance_km numeric(6, 1),
  pass_crossed text,
  weather_note text,
  cover_photo_url text,

  guide_note text,
  client_note text,
  client_note_author text,

  client_names_ok boolean not null default false,
  client_photos_ok boolean not null default false,

  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journals_dates_sane check (end_date >= start_date),
  constraint journals_real_trip check (booking_id is not null or pre_platform)
);

create index journals_guide_idx on journals (guide_id, status);
create index journals_route_idx on journals (route_id) where status = 'published';
create index journals_published_idx on journals (published_at desc) where status = 'published';
create unique index journals_booking_uniq on journals (booking_id) where booking_id is not null;

create trigger journals_touch before update on journals
  for each row execute function public.touch_updated_at();

-- ---- entries: the day blocks that are the blog body ------------------------
-- photos is jsonb, not text[], because each photo carries whether a client is
-- recognisable in it. That is what lets the view drop people-photos when
-- client_photos_ok is false instead of hiding the whole journal.
--   [{ "url": "...", "alt": "...", "people": true }]
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references journals(id) on delete cascade,
  day_no int not null,
  title text not null,
  body text,
  altitude_m int,
  -- The weather hold, the turn-back, the night someone was sick. Rendered as
  -- its own block rather than buried: honesty is the brand.
  is_hard_day boolean not null default false,
  photos jsonb not null default '[]'::jsonb,
  -- full | two | portrait — the page varies these so no grid shape repeats.
  layout text not null default 'full' check (layout in ('full', 'two', 'portrait')),
  unique (journal_id, day_no)
);

create index journal_entries_journal_idx on journal_entries (journal_id, day_no);

-- ---- denormalised count for the profile stat band --------------------------
alter table guides add column if not exists journals_count int not null default 0;

create or replace function public.refresh_journals_count()
  returns trigger language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  gid := coalesce(new.guide_id, old.guide_id);
  update guides g set journals_count = (
    select count(*) from journals j where j.guide_id = gid and j.status = 'published'
  ) where g.user_id = gid;
  return null;
end;
$$;

create trigger journals_count_sync
  after insert or update or delete on journals
  for each row execute function public.refresh_journals_count();

-- ---- public views: consent applied here, once ------------------------------
create view public_journals as
  select
    j.id,
    j.slug,
    j.title,
    j.start_date,
    j.end_date,
    (j.end_date - j.start_date) + 1 as days,
    j.max_altitude_m,
    j.distance_km,
    j.pass_crossed,
    j.weather_note,
    j.cover_photo_url,
    j.guide_note,
    j.client_note,
    -- Consent gate. Without client_names_ok the real label never leaves the DB.
    case when j.client_names_ok then j.group_label else j.group_anon end as group_display,
    case when j.client_names_ok then j.client_note_author else null end as client_note_author,
    j.client_photos_ok,
    j.published_at,
    j.guide_id,
    g.slug        as guide_slug,
    u.full_name   as guide_name,
    u.avatar_url  as guide_avatar_url,
    g.tier        as guide_tier,
    g.only_with_me as guide_only_with_me,
    g.home_district as guide_district,
    j.route_id,
    r.slug        as route_slug,
    r.name        as route_name,
    r.region      as route_region
  from journals j
  join guides g on g.user_id = j.guide_id
  join users u on u.id = j.guide_id
  left join routes r on r.id = j.route_id
  where j.status = 'published' and g.status = 'verified';

grant select on public_journals to anon, authenticated;

create view public_journal_entries as
  select
    e.id,
    e.journal_id,
    e.day_no,
    e.title,
    e.body,
    e.altitude_m,
    e.is_hard_day,
    e.layout,
    -- Second half of the consent gate: when the client did not agree to
    -- photos, only the frames with nobody recognisable in them survive.
    case
      when j.client_photos_ok then e.photos
      else coalesce(
        (select jsonb_agg(p) from jsonb_array_elements(e.photos) p
          where coalesce((p ->> 'people')::boolean, false) = false),
        '[]'::jsonb)
    end as photos
  from journal_entries e
  join journals j on j.id = e.journal_id
  join guides g on g.user_id = j.guide_id
  where j.status = 'published' and g.status = 'verified';

grant select on public_journal_entries to anon, authenticated;

-- ---- RLS -------------------------------------------------------------------
alter table journals enable row level security;
alter table journal_entries enable row level security;

-- Public reads go through the views (which are owner-invoked and bypass these
-- policies); the base tables stay closed to anon so drafts never leak.
create policy journals_guide_read on journals for select
  using (guide_id = auth.uid() or public.is_ops());
create policy journals_guide_write on journals for insert
  with check (guide_id = auth.uid() or public.is_ops());
create policy journals_guide_update on journals for update
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());
create policy journals_ops_delete on journals for delete using (public.is_ops());

create policy journal_entries_owner on journal_entries for all
  using (
    public.is_ops()
    or exists (select 1 from journals j where j.id = journal_id and j.guide_id = auth.uid())
  )
  with check (
    public.is_ops()
    or exists (select 1 from journals j where j.id = journal_id and j.guide_id = auth.uid())
  );

-- A guide may write and edit their own journal, but only ops publishes it —
-- publishing is where the consent checkboxes and the real-trip rule get eyes.
create or replace function public.guard_journal_publish()
  returns trigger language plpgsql as $$
begin
  if public.is_ops() or current_user in ('service_role', 'supabase_admin', 'postgres') then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'only ops can publish or unpublish a journal';
  end if;
  return new;
end;
$$;

create trigger journals_publish_guard before update on journals
  for each row execute function public.guard_journal_publish();

notify pgrst, 'reload schema';
