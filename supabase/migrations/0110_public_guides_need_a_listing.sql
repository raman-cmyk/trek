-- 0110 — a guide with nothing to book is not a guide you can meet.
--
-- `public_guides` asked one question: is the status 'verified'. So a guide who
-- was checked and approved and then never listed anything appeared in the
-- directory, on the atlas and in search — a face, a district, a day rate, and
-- no way to book them. Four of the fifty-one are in exactly that state.
--
-- Being verified is about trust. Being listable is about having something to
-- sell, and the second is what a directory is for.
--
-- The view keeps owner rights, as it had: it exposes only the public columns
-- of verified guides and is read by anonymous visitors, which is the whole
-- point of it.

create or replace view public_guides as
  select g.user_id,
         g.slug,
         split_part(btrim(u.full_name), ' '::text, 1) as full_name,
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
         g.updated_at,
         g.regions
    from guides g
    join users u on u.id = g.user_id
   where g.status = 'verified'
     and exists (
           select 1 from offerings o
            where o.guide_id = g.user_id
              and o.status = 'live'
         );

comment on view public_guides is
  'Verified guides who have something bookable (0110). A verified guide with
   no live experience is trusted but not meetable, and a directory is for
   meeting people.';
