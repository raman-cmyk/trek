-- 0023 — Backup guide on every trek (Feature Pack v3 §12). If the lead guide
-- can't lead (illness, injury), the named backup steps in — the trek never
-- cancels. Exposed on public_offerings so the trek page can show it as a
-- trust signal. New view columns appended at the end (CREATE OR REPLACE rule).

alter table offerings add column backup_guide_id uuid references guides(user_id);

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
    bu.avatar_url   as backup_guide_avatar_url
  from offerings o
  join guides g on g.user_id = o.guide_id
  join users u on u.id = g.user_id
  left join routes r on r.id = o.route_id
  left join guides bg on bg.user_id = o.backup_guide_id and bg.status = 'verified'
  left join users bu on bu.id = bg.user_id
  where o.status = 'live' and g.status = 'verified';

grant select on public_offerings to anon, authenticated;

-- Give every live trek a backup: the next verified guide round-robin, never
-- the lead themselves. Deterministic so seed/demo data stays stable.
with verified as (
  select user_id, row_number() over (order by user_id) as rn, count(*) over () as n
  from guides where status = 'verified'
),
leads as (
  select o.id as offering_id, v.rn
  from offerings o join verified v on v.user_id = o.guide_id
  where o.kind = 'trek'
)
update offerings o
set backup_guide_id = pick.user_id
from leads l
join verified pick on pick.rn = (l.rn % (select max(n) from verified)) + 1
where o.id = l.offering_id and o.backup_guide_id is null;
