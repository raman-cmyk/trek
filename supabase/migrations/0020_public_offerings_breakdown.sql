-- 0020 — expose price_breakdown (and route altitude) on the public_offerings
-- view so the experience page and cards can render the full Split (v3 §0).
-- New columns are appended at the end so CREATE OR REPLACE accepts it.
create or replace view public_offerings as
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
    g.user_id  as guide_id,
    g.slug     as guide_slug,
    u.full_name as guide_name,
    u.avatar_url as guide_avatar_url,
    g.tier     as guide_tier,
    g.day_rate_usd_cents as guide_day_rate_usd_cents,
    o.price_breakdown,
    r.max_altitude_m
  from offerings o
  join guides g on g.user_id = o.guide_id
  join users u on u.id = g.user_id
  left join routes r on r.id = o.route_id
  where o.status = 'live' and g.status = 'verified';

grant select on public_offerings to anon, authenticated;
