-- 0030 — only_with_me: the one thing you get with THIS guide and nobody else.
--
-- The hook_line is a description ("Ghandruk-born, knows the quiet trails").
-- This is a promise, in the guide's own voice, about one concrete thing:
-- "You'll sleep at my family's house in Ghandruk, not a teahouse."
--
-- Guides write it themselves and we do not polish it. Imperfect English from
-- a real person outperforms fluent copy from an agency — that IS the product.
-- The length cap is the only rule we enforce in the database; "one specific
-- thing, no marketing adjectives" is guidance in the form, not a constraint,
-- because a check constraint that rejects a guide's sentence at 2am with no
-- explanation is worse than a weak line.

alter table guides
  add column if not exists only_with_me text
    check (only_with_me is null or char_length(only_with_me) <= 90);

comment on column guides.only_with_me is
  'First-person, one concrete thing unique to trekking with this guide. Under ~12 words. Written by the guide, published unedited.';

-- Expose publicly. Column appended at the end so existing ordinals hold.
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
    g.porter_welfare,
    g.gender,
    g.only_with_me
  from guides g
  join users u on u.id = g.user_id
  where g.status = 'verified';

grant select on public_guides to anon, authenticated;

notify pgrst, 'reload schema';
