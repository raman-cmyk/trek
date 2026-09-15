-- Carry the guide's years of experience onto the offering view.
--
-- An experience card ends with what other people said about the guide. A guide
-- with no reviews yet is the common case on a new marketplace, and a 0.0 reads
-- as a bad guide rather than a new one. The card falls back to "New here · 14
-- years guiding", which is truthful and is the thing a trekker actually wants
-- to know -- but it had nothing to read it from, so every review-less card said
-- "No reviews yet" even for a guide with a twenty-year career.
--
-- Additive: the view is replaced with the same columns in the same order plus
-- one at the end, so CREATE OR REPLACE VIEW is legal and nothing that selects
-- by name changes.

-- NOTE (corrected in the same session it was written): this view was first
-- written by copying the definition live in production, which already carried
-- nine columns added by a second Claude session working in parallel
-- (activity_level, transport, faqs, ref_code and the rest). Those columns have
-- no migration on this branch, so a fresh clone would have failed right here on
-- a view referencing columns nothing had created. They are removed here and
-- adopted properly in 0088, which re-creates the view with all of them.

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
    g.years_experience AS guide_years_experience
   FROM offerings o
     JOIN guides g ON g.user_id = o.guide_id
     JOIN users u ON u.id = g.user_id
     LEFT JOIN routes r ON r.id = o.route_id
     LEFT JOIN guides bg ON bg.user_id = o.backup_guide_id AND bg.status = 'verified'::text
     LEFT JOIN users bu ON bu.id = bg.user_id
  WHERE o.status = 'live'::text AND g.status = 'verified'::text;

GRANT SELECT ON public.public_offerings TO anon, authenticated, service_role;
