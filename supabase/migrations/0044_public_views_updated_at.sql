-- 0044 — Expose updated_at on the public views, for sitemap <lastmod>.
--
-- The sitemap listed every URL but carried no <lastmod>, so a crawler had no
-- way to tell a guide profile edited this morning from one untouched since
-- launch. The base tables already track it — guides, offerings and events
-- carry a `touch` trigger that moves updated_at on every write — the public
-- views simply did not pass the column through.
--
-- Journals already expose published_at, and routes/recaps carry only
-- created_at, so those keep their own dates; the sitemap picks the best
-- available date per content type rather than inventing one.

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
    g.updated_at
   FROM guides g
     JOIN users u ON u.id = g.user_id
  WHERE g.status = 'verified'::text;

create or replace view public_offerings as
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
    o.updated_at
   FROM offerings o
     JOIN guides g ON g.user_id = o.guide_id
     JOIN users u ON u.id = g.user_id
     LEFT JOIN routes r ON r.id = o.route_id
     LEFT JOIN guides bg ON bg.user_id = o.backup_guide_id AND bg.status = 'verified'::text
     LEFT JOIN users bu ON bu.id = bg.user_id
  WHERE o.status = 'live'::text AND g.status = 'verified'::text;

create or replace view public_events as
 SELECT e.id,
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
    split_part(btrim(ou.full_name), ' '::text, 1) AS organiser_name,
    ou.avatar_url AS organiser_avatar_url,
    e.route_id,
    r.slug AS route_slug,
    r.name AS route_name,
    e.guide_id,
    g.slug AS guide_slug,
    split_part(btrim(gu.full_name), ' '::text, 1) AS guide_name,
    gu.avatar_url AS guide_avatar_url,
    COALESCE(( SELECT sum(s.party_size) AS sum
           FROM event_signups s
          WHERE s.event_id = e.id AND (s.status = ANY (ARRAY['interested'::text, 'confirmed'::text]))), 0::bigint)::integer AS taken,
    e.updated_at
   FROM events e
     JOIN users ou ON ou.id = e.organiser_id
     LEFT JOIN routes r ON r.id = e.route_id
     LEFT JOIN guides g ON g.user_id = e.guide_id
     LEFT JOIN users gu ON gu.id = e.guide_id
  WHERE e.status = 'live'::text;
