-- 0061 — Liking a trek somebody wrote up.
--
-- Journals already take comments (0038), which is the expensive gesture: you
-- have to have something to say. A like is the cheap one, and cheap is the
-- point — a guide who writes up a trek at eleven at night wants to know it was
-- read, and most readers will never write a paragraph.
--
-- One row per person per journal, so the count cannot be inflated by tapping
-- twice, and so a person can take it back.

create table if not exists journal_likes (
  journal_id uuid not null references journals(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (journal_id, user_id)
);

create index if not exists journal_likes_journal_idx on journal_likes (journal_id);
create index if not exists journal_likes_user_idx on journal_likes (user_id, created_at desc);

alter table journal_likes enable row level security;

-- Everyone signed in can see who liked what — the count is public anyway, and
-- a guide seeing which of their trekkers liked a write-up is the good version
-- of this feature. Nobody writes a like for anybody else.
drop policy if exists journal_likes_read on journal_likes;
create policy journal_likes_read on journal_likes
  for select to authenticated using (true);

drop policy if exists journal_likes_own_write on journal_likes;
create policy journal_likes_own_write on journal_likes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The count joins the public view. Appended last: `create or replace view`
-- can only add columns at the end (0060 learned this the hard way).
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
    j.pre_platform,
    ( SELECT count(*) AS count
           FROM journal_likes l
          WHERE l.journal_id = j.id) AS like_count
   FROM journals j
     JOIN guides g ON g.user_id = j.guide_id
     JOIN users u ON u.id = j.guide_id
     LEFT JOIN routes r ON r.id = j.route_id
  WHERE j.status = 'published'::text AND g.status = 'verified'::text;

grant select on public_journals to anon, authenticated;

notify pgrst, 'reload schema';
