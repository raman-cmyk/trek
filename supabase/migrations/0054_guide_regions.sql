-- 0054 — Where a guide works, as opposed to where they are from.
--
-- A guide had exactly one place attached to them: home_district, meaning the
-- district they grew up in. A Solukhumbu guide who runs Annapurna every autumn
-- was filed under Solukhumbu and their actual reach was invisible — to
-- trekkers browsing, and to the office deciding who to put on a trip.
--
-- An array rather than a join table: a region carries no attributes of its
-- own (unlike guide_languages, where proficiency is the point), and every
-- listing page already reads the guides view, so keeping it there means no
-- extra round trip on the pages that matter most.

alter table guides
  add column if not exists regions text[] not null default '{}';

-- Membership lookups for the browse filter.
create index if not exists guides_regions_idx on guides using gin (regions);

-- Guides set this themselves, so it is deliberately NOT added to
-- guard_guide_columns() — that guard is for verification and ranking columns
-- a guide must not be able to move.

-- public_guides must be restated in full: create or replace cannot reorder or
-- drop columns, so the new one is appended last. Columns 1-19 are exactly as
-- 0044 left them.
create or replace view public_guides as
 SELECT g.user_id,
    g.slug,
    split_part(btrim(u.full_name), ' '::text, 1) AS full_name,
    u.avatar_url,
    g.home_district,
    g.tier,
    g.hook_line,
    g.bio,
    g.voice_intro_url,
    g.years_experience,
    g.day_rate_usd_cents,
    g.response_rate,
    g.median_response_mins,
    g.treks_completed_platform,
    g.created_at,
    g.porter_welfare,
    g.gender,
    g.only_with_me,
    g.updated_at,
    g.regions
   FROM guides g
     JOIN users u ON u.id = g.user_id
  WHERE g.status = 'verified'::text;

grant select on public_guides to anon, authenticated;

-- Seed the obvious: a guide who has published a trip on a route plainly works
-- that route's region. Better than leaving every existing guide blank and
-- hoping they come back to tick boxes.
update guides g
set regions = sub.regions
from (
  select o.guide_id, array_agg(distinct r.region order by r.region) as regions
  from offerings o
  join routes r on r.id = o.route_id
  where o.route_id is not null and r.region is not null
  group by o.guide_id
) sub
where g.user_id = sub.guide_id
  and g.regions = '{}';

notify pgrst, 'reload schema';
