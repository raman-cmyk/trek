-- 0037 — Expose the route's slug/name/region on public_offerings.
--
-- Route pages are the primary SEO surface, and they only earn that if the rest
-- of the site links into them. Every experience card and trek page knows its
-- route_id already; without the slug it cannot render a link, so the entire
-- catalogue pointed at /routes and stopped. New columns appended at the end
-- (CREATE OR REPLACE rule: existing columns keep their position and type).

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
    r.max_altitude_m,
    bg.slug         as backup_guide_slug,
    bu.full_name    as backup_guide_name,
    bu.avatar_url   as backup_guide_avatar_url,
    g.porter_welfare as guide_porter_welfare,
    r.slug          as route_slug,
    r.name          as route_name,
    r.region        as route_region
  from offerings o
  join guides g on g.user_id = o.guide_id
  join users u on u.id = g.user_id
  left join routes r on r.id = o.route_id
  left join guides bg on bg.user_id = o.backup_guide_id and bg.status = 'verified'
  left join users bu on bu.id = bg.user_id
  where o.status = 'live' and g.status = 'verified';

grant select on public_offerings to anon, authenticated;
