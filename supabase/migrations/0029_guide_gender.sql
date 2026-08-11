-- 0029 — guide gender, so "a female guide" is a filter and not a guess.
--
-- Solo women travellers ask for this constantly and it is the single most
-- requested facet we cannot currently answer. Nullable and self-declared:
-- a guide who doesn't want to state it simply doesn't appear under the
-- filter, and nothing else in the product branches on it.

alter table guides
  add column if not exists gender text
    check (gender is null or gender in ('female', 'male', 'other'));

comment on column guides.gender is
  'Self-declared, optional. Used only to power the "women guides" browse filter.';

-- Guides may edit this themselves (it is not a verification/ranking column,
-- so guard_guide_columns already lets it through).

-- Expose on the public view. Column appended at the end so ordinal positions
-- of the existing columns are untouched.
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
    g.gender
  from guides g
  join users u on u.id = g.user_id
  where g.status = 'verified';

grant select on public_guides to anon, authenticated;

-- Browse filters hit these three paths on every search; at 12 guides it does
-- not matter and at 12,000 it does.
create index if not exists guides_gender_idx on guides (gender) where gender is not null;
create index if not exists availability_day_open_idx on availability (day) where status = 'open';

notify pgrst, 'reload schema';
