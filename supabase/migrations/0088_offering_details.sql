-- 0088 — adopt the trip-detail columns built by the parallel session.
--
-- Two Claude sessions built this project in parallel on 14-15 September and
-- deployed over each other all day; docs/MERGE-HANDOVER.md is the smaller
-- branch handing its work to this one. These columns were already applied to
-- production from that branch, so this file is the migration catching up with
-- a schema the database has had for a day -- every statement is idempotent and
-- re-running it against production is a no-op.
--
-- Renumbered: the original is 0066_offering_details.sql on
-- claude/new-session-vereu4, and 0066-0068 are taken on this branch. Body
-- unchanged from the original apart from the view at the end, which is
-- re-created below instead so it can also carry guide_years_experience (0087).
--
-- Original preamble follows.

-- 0066 — the details a trip page is expected to carry.
--
-- Held up against the pages trekkers actually compare us with, our offering
-- page is missing a whole tier of ordinary fact. Theirs answers, in labelled
-- rows: how you move (walking, private vehicle, a domestic flight), how hard
-- it is, what languages your guide will speak on the day, whether somebody
-- with a knee problem can come, a reference number to quote in an email, and
-- the six questions everybody asks. Ours answered none of those, and there was
-- nowhere for a guide to say them — so the gap was not a UI gap, it was a
-- schema gap.
--
-- Codes, not sentences, for everything that has to be filterable or
-- translatable later; the words live in app/lib/offering-details.ts so the
-- copywriter can change "Private vehicle" without a migration. A free-text
-- note sits beside each list for the thing no code covers ("the jeep to
-- Syabrubesi is shared for the first hour").
--
-- `languages` empty means "whatever this guide speaks", read from
-- guide_languages. A trip led in one of three is the exception, so the
-- exception is what gets stored.

alter table offerings
  add column if not exists activity_level text,
  add column if not exists transport text[] not null default '{}',
  add column if not exists transport_note text,
  add column if not exists accessibility text[] not null default '{}',
  add column if not exists accessibility_note text,
  add column if not exists languages text[] not null default '{}',
  add column if not exists faqs jsonb not null default '[]'::jsonb,
  add column if not exists ref_code text;

-- Four levels, because five is a scale nobody can tell apart and three cannot
-- separate "a long day on a path" from "eight hours over a 5,400m pass".
alter table offerings drop constraint if exists offerings_activity_level_ck;
alter table offerings add constraint offerings_activity_level_ck
  check (activity_level is null or activity_level in ('easy','moderate','challenging','strenuous'));

-- Both arrays hold a closed set of codes. A code the app does not know would
-- render as a blank row, which is worse than refusing the write.
alter table offerings drop constraint if exists offerings_transport_ck;
alter table offerings add constraint offerings_transport_ck
  check (transport <@ array[
    'walking','private_vehicle','shared_jeep','domestic_flight',
    'tourist_bus','local_bus','boat','cable_car','motorbike'
  ]::text[]);

alter table offerings drop constraint if exists offerings_accessibility_ck;
alter table offerings add constraint offerings_accessibility_ck
  check (accessibility <@ array[
    'step_free','wheelchair','service_animals','hearing','vision',
    'kid_friendly','stroller','not_for_limited_mobility','altitude_health'
  ]::text[]);

-- FAQs are a flat array of {q, a}. Checked here rather than trusted, because
-- this renders into a page and into FAQPage structured data: a malformed entry
-- is an invalid rich result, not just an ugly row.
--
-- The test lives in a function because a check constraint may not contain a
-- subquery, and walking the array needs one.
create or replace function faqs_well_formed(p jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(p) = 'array'
     and not exists (
       select 1
       from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or coalesce(e ->> 'q', '') = ''
          or coalesce(e ->> 'a', '') = ''
     );
$$;

alter table offerings drop constraint if exists offerings_faqs_ck;
alter table offerings add constraint offerings_faqs_ck check (faqs_well_formed(faqs));

-- The reference number a trekker quotes in an email, and the office searches
-- for. Derived from the id so it is stable for the life of the trip and needs
-- no sequence: GN-A1B2C3.
create or replace function offering_ref_code(p_id uuid)
returns text language sql immutable as $$
  select 'GN-' || upper(substr(md5(p_id::text), 1, 6));
$$;

update offerings set ref_code = offering_ref_code(id) where ref_code is null;

create or replace function offerings_set_ref_code()
returns trigger language plpgsql as $$
begin
  if new.ref_code is null then
    new.ref_code := offering_ref_code(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists offerings_ref_code_trg on offerings;
create trigger offerings_ref_code_trg
  before insert on offerings
  for each row execute function offerings_set_ref_code();

create unique index if not exists offerings_ref_code_uk on offerings (ref_code);

comment on column offerings.languages is
  'Empty means "whatever this guide speaks" — read guide_languages. Only a
   trip led in a subset of them stores anything here.';
comment on column offerings.ref_code is
  'Quoted by trekkers in email and searched by the office. Derived from the id,
   so it never changes and two rows cannot collide.';

-- The view again, last definition wins: their nine columns plus the
-- guide_years_experience 0087 added. 0087 deliberately does not mention the
-- nine, so that a fresh clone builds a view it can actually build; this is the
-- first point in the chain where every column exists.

DROP VIEW IF EXISTS public.public_offerings CASCADE;

CREATE VIEW public.public_offerings AS
 SELECT o.id,
    o.slug,
    o.kind,
    o.route_id,
    o.title,
    o.summary,
    o.days,
    o.price_usd_cents,
    o.max_party,
    o.min_party,
    o.meeting_point,
    o.included,
    o.excluded,
    o.itinerary,
    o.cover_photo_url,
    o.created_at,
    g.user_id AS guide_id,
    g.slug AS guide_slug,
    split_part(btrim(u.full_name), ' '::text, 1) AS guide_name,
    u.avatar_url AS guide_avatar_url,
    g.tier AS guide_tier,
    g.day_rate_usd_cents AS guide_day_rate_usd_cents,
    o.price_breakdown,
    r.max_altitude_m,
    bg.slug AS backup_guide_slug,
    split_part(btrim(bu.full_name), ' '::text, 1) AS backup_guide_name,
    bu.avatar_url AS backup_guide_avatar_url,
    g.porter_welfare AS guide_porter_welfare,
    r.slug AS route_slug,
    r.name AS route_name,
    r.region AS route_region,
    o.updated_at,
    o.meet_time,
    o.activity_level,
    o.transport,
    o.transport_note,
    o.accessibility,
    o.accessibility_note,
    o.languages,
    o.faqs,
    o.ref_code,
    g.years_experience AS guide_years_experience
   FROM offerings o
     JOIN guides g ON g.user_id = o.guide_id
     JOIN users u ON u.id = g.user_id
     LEFT JOIN routes r ON r.id = o.route_id
     LEFT JOIN guides bg ON bg.user_id = o.backup_guide_id AND bg.status = 'verified'::text
     LEFT JOIN users bu ON bu.id = bg.user_id
  WHERE o.status = 'live'::text AND g.status = 'verified'::text;

GRANT SELECT ON public.public_offerings TO anon, authenticated, service_role;
