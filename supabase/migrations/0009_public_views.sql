-- 0009 — Public-safe projections (docs/03 §Views).
-- These views run with the definer's privileges (security_invoker = false, the
-- default) so they bypass RLS on the base tables and expose ONLY safe columns
-- to anon. No phone, no payout details, no full licence number. Anon has no
-- direct policy on the base guides/offerings tables — public reads go here.

-- ---- public_guides ---------------------------------------------------------
create view public_guides as
  select
    g.user_id,
    g.slug,
    u.full_name,
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
    g.created_at
  from guides g
  join users u on u.id = g.user_id
  where g.status = 'verified';

-- ---- public_offerings ------------------------------------------------------
create view public_offerings as
  select
    o.id,
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
    -- guide identity for the always-present GuideChip (docs/04)
    g.user_id  as guide_id,
    g.slug     as guide_slug,
    u.full_name as guide_name,
    u.avatar_url as guide_avatar_url,
    g.tier     as guide_tier
  from offerings o
  join guides g on g.user_id = o.guide_id
  join users u on u.id = g.user_id
  where o.status = 'live' and g.status = 'verified';

grant select on public_guides to anon, authenticated;
grant select on public_offerings to anon, authenticated;

-- Base tables whose RLS policies intend public/anon read need a table-level
-- SELECT grant for those policies to be reachable. Supabase grants this by
-- default; we state it explicitly so the schema is self-contained. RLS still
-- filters rows (e.g. reviews → published only, departures → open only).
grant select on routes, permits, availability, redirects, reviews, recaps, departures
  to anon, authenticated;
