-- 0011 — public_reviews: published trekker→guide reviews, joined out to the
-- guide and offering, so public pages can show ratings + review text WITHOUT
-- exposing the bookings table to anon. Security-definer view (bypasses RLS on
-- the joined base tables); only published trekker→guide rows are included.

create view public_reviews as
  select
    r.id,
    r.overall,
    r.body,
    r.sub_ratings,
    r.published_at,
    r.guide_reply,
    r.subject_id as guide_id,
    g.slug as guide_slug,
    b.offering_id,
    o.slug as offering_slug,
    au.full_name as author_name,
    au.country_code as author_country
  from reviews r
  join bookings b on b.id = r.booking_id
  join offerings o on o.id = b.offering_id
  join guides g on g.user_id = r.subject_id
  join users au on au.id = r.author_id
  where r.published_at is not null and r.direction = 'trekker_to_guide';

grant select on public_reviews to anon, authenticated;
