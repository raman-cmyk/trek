-- 0060 — A guide's work did not start the day they joined.
--
-- A journal has always been allowed to be a trek from outside the platform:
-- 0032 gave it `pre_platform` and a constraint that a journal hangs off a
-- booking OR that flag. Nothing ever set it. So a guide who joined last week —
-- fifteen years of Manaslu behind them, no bookings here yet — had nothing
-- they could write up, and the one thing that would make a trekker choose them
-- was the one thing they could not do.
--
-- The flag is now something the guide sets when they start the write-up. Which
-- means the public page has to say so: a trek we arranged and a trek we did
-- not are both true, and only one of them is ours to vouch for. `pre_platform`
-- joins the public view so the page can label it, rather than letting a reader
-- assume the stronger claim.

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
          WHERE c.journal_id = j.id AND c.hidden = false) AS comment_count,
    -- Appended last on purpose: `create or replace view` can only add columns
    -- at the end, and inserting one in the middle renames every column after
    -- it. Was this trek arranged through us? A reader is entitled to know
    -- which claim they are looking at.
    j.pre_platform
   FROM journals j
     JOIN guides g ON g.user_id = j.guide_id
     JOIN users u ON u.id = j.guide_id
     LEFT JOIN routes r ON r.id = j.route_id
  WHERE j.status = 'published'::text AND g.status = 'verified'::text;

grant select on public_journals to anon, authenticated;

notify pgrst, 'reload schema';
