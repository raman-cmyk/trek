-- 0042 — First names only, everywhere the public can see.
--
-- Founder's rule: no guide's and no trekker's family name appears in the
-- app, ever. In Nepal a surname is an ethnicity — Sherpa, Tamang, Gurung,
-- Thapa — and a marketplace that prints it on every card invites people to
-- choose a guide by caste. A first name, a face, a district and a licence
-- say everything a booking decision needs.
--
-- Enforced here, in the public views, rather than at fifty render sites:
-- a surface that reads these views cannot leak a surname even by accident.
-- Full legal names stay in the base tables — the ops console, contracts,
-- TIMS cards and permits are legal documents and keep them.

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
    g.only_with_me
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
    r.region AS route_region
   FROM offerings o
     JOIN guides g ON g.user_id = o.guide_id
     JOIN users u ON u.id = g.user_id
     LEFT JOIN routes r ON r.id = o.route_id
     LEFT JOIN guides bg ON bg.user_id = o.backup_guide_id AND bg.status = 'verified'::text
     LEFT JOIN users bu ON bu.id = bg.user_id
  WHERE o.status = 'live'::text AND g.status = 'verified'::text;

create or replace view public_journals as
 SELECT j.id,
    j.slug,
    j.title,
    j.start_date,
    j.end_date,
    j.end_date - j.start_date + 1 AS days,
    j.max_altitude_m,
    j.distance_km,
    j.pass_crossed,
    j.weather_note,
    j.cover_photo_url,
    j.guide_note,
    j.client_note,
        CASE
            WHEN j.client_names_ok THEN j.group_label
            ELSE j.group_anon
        END AS group_display,
        CASE
            WHEN j.client_names_ok THEN j.client_note_author
            ELSE NULL::text
        END AS client_note_author,
    j.client_photos_ok,
    j.published_at,
    j.guide_id,
    g.slug AS guide_slug,
    split_part(btrim(u.full_name), ' '::text, 1) AS guide_name,
    u.avatar_url AS guide_avatar_url,
    g.tier AS guide_tier,
    g.only_with_me AS guide_only_with_me,
    g.home_district AS guide_district,
    j.route_id,
    r.slug AS route_slug,
    r.name AS route_name,
    r.region AS route_region,
    j.kind,
    ( SELECT count(*) AS count
           FROM journal_comments c
          WHERE c.journal_id = j.id AND c.hidden = false) AS comment_count
   FROM journals j
     JOIN guides g ON g.user_id = j.guide_id
     JOIN users u ON u.id = j.guide_id
     LEFT JOIN routes r ON r.id = j.route_id
  WHERE j.status = 'published'::text AND g.status = 'verified'::text;

create or replace view public_journal_comments as
 SELECT c.id,
    c.journal_id,
    c.parent_id,
    c.body,
    c.created_at,
    c.author_id,
    split_part(btrim(u.full_name), ' '::text, 1) AS author_name,
    u.avatar_url AS author_avatar_url,
    c.author_id = j.guide_id AS author_is_guide,
    g.slug AS author_guide_slug
   FROM journal_comments c
     JOIN journals j ON j.id = c.journal_id
     JOIN guides jg ON jg.user_id = j.guide_id
     JOIN users u ON u.id = c.author_id
     LEFT JOIN guides g ON g.user_id = c.author_id
  WHERE c.hidden = false AND j.status = 'published'::text AND jg.status = 'verified'::text;

create or replace view public_reviews as
 SELECT r.id,
    r.overall,
    r.body,
    r.sub_ratings,
    r.published_at,
    r.guide_reply,
    r.subject_id AS guide_id,
    g.slug AS guide_slug,
    b.offering_id,
    o.slug AS offering_slug,
    split_part(btrim(au.full_name), ' '::text, 1) AS author_name,
    au.country_code AS author_country
   FROM reviews r
     JOIN bookings b ON b.id = r.booking_id
     JOIN offerings o ON o.id = b.offering_id
     JOIN guides g ON g.user_id = r.subject_id
     JOIN users au ON au.id = r.author_id
  WHERE r.published_at IS NOT NULL AND r.direction = 'trekker_to_guide'::text;

-- The questions view named the guide in full under every answer.
create or replace view public_guide_questions as
 SELECT q.id,
    q.guide_id,
    g.slug AS guide_slug,
    split_part(btrim(u.full_name), ' '::text, 1) AS guide_name,
    split_part(btrim(q.asker_name), ' '::text, 1) AS asker_first_name,
    q.asker_country,
    q.body,
    q.answer,
    q.answered_at,
    q.helpful_count,
    q.created_at
   FROM guide_questions q
     JOIN guides g ON g.user_id = q.guide_id
     JOIN users u ON u.id = q.guide_id
  WHERE q.status = 'answered'::text AND q.hidden = false AND g.status = 'verified'::text;

-- Seeded photo alt-texts carried full names ("Pemba Sherpa smiling…").
-- Alt text is app output like any other text; the rule applies.
update guide_photos gp
   set alt_text = replace(gp.alt_text, u.full_name, split_part(btrim(u.full_name), ' ', 1))
  from guides g
  join users u on u.id = g.user_id
 where gp.guide_id = g.user_id
   and gp.alt_text like '%' || u.full_name || '%';
