-- 0024 — Phase 3: public verification receipts + porter-welfare pledge.
--
-- Verification receipts: the checks a guide passed, WITH dates, publicly
-- visible — "a tier you can look up is trust; one you can't is decoration."
-- Safe columns only (never document_url/notes), verified guides only,
-- passed checks only.
--
-- Porter welfare: guides who take the IPPG-aligned pledge (weight limits,
-- insurance, fair wages, proper gear for their porters) get a public badge.

alter table guides add column porter_welfare boolean not null default false;

create or replace view public_guide_verifications as
  select
    gv.guide_id,
    gv.check_type,
    gv.verified_at,
    gv.expires_at
  from guide_verifications gv
  join guides g on g.user_id = gv.guide_id
  where g.status = 'verified' and gv.status = 'passed';

grant select on public_guide_verifications to anon, authenticated;

-- Expose the pledge on the public guide view (columns appended at the end).
create or replace view public_guides as
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
    g.created_at,
    g.porter_welfare
  from guides g
  join users u on u.id = g.user_id
  where g.status = 'verified';

grant select on public_guides to anon, authenticated;

-- ...and on public_offerings via the lead guide (appended at the end).
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
    g.porter_welfare as guide_porter_welfare
  from offerings o
  join guides g on g.user_id = o.guide_id
  join users u on u.id = g.user_id
  left join routes r on r.id = o.route_id
  left join guides bg on bg.user_id = o.backup_guide_id and bg.status = 'verified'
  left join users bu on bu.id = bg.user_id
  where o.status = 'live' and g.status = 'verified';

grant select on public_offerings to anon, authenticated;

-- Demo data: verified guides' passed checks get real dates; every verified
-- guide's licence/id/phone shows as passed (that's what 'verified' means).
update guide_verifications gv
set status = 'passed'
from guides g
where g.user_id = gv.guide_id and g.status = 'verified'
  and gv.check_type in ('licence', 'id_match', 'phone', 'reference_1');

update guide_verifications gv
set verified_at = g.created_at + interval '3 days',
    expires_at = case when gv.check_type in ('licence', 'first_aid')
                      then (g.created_at + interval '3 days' + interval '2 years') end
from guides g
where g.user_id = gv.guide_id and g.status = 'verified' and gv.status = 'passed'
  and gv.verified_at is null;

-- Pledge: tier-2+ guides have taken it in the demo data.
update guides set porter_welfare = true where status = 'verified' and tier >= 2;

notify pgrst, 'reload schema';
