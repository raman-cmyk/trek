-- 0038 — Journals become posts: three kinds, video alongside photos, and a
-- threaded comment section.
--
-- Until now a journal was always a multi-day trek album. That is the flagship
-- shape, but a guide who wants to say one thing about one morning had nowhere
-- to put it and so said nothing. Three kinds now:
--
--   journey — the full album. Days, altitudes, a route. What we already had.
--   post    — one moment. No days; the entry list is a single block.
--   gallery — photos with almost no words. A season in twenty frames.
--
-- Video rides in the same `photos` jsonb as photos do, distinguished by a
-- "kind" key. Keeping one ordered media array (rather than a second column)
-- is what lets a day read as it happened: photo, photo, the clip of the pass,
-- photo — in the guide's order, not photos-then-videos.

alter table journals
  add column kind text not null default 'journey'
    check (kind in ('journey', 'post', 'gallery'));

comment on column journals.kind is
  'journey = multi-day album, post = single moment, gallery = photos with few words.';

-- A post has no meaningful trek length; the publish gate skips the
-- every-day-covered rule for them (see validateForPublish).
create index journals_kind_idx on journals (kind) where status = 'published';

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
-- One table, self-referencing for replies. Depth is capped at 2 in the UI
-- (comment → reply) because a trekking story does not need Reddit; the column
-- allows deeper so we are not migrating again if it turns out it does.

create table journal_comments (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references journals(id) on delete cascade,
  parent_id uuid references journal_comments(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  -- Soft moderation: ops can hide without destroying the thread shape.
  hidden boolean not null default false,
  hidden_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index journal_comments_journal_idx on journal_comments (journal_id, created_at);
create index journal_comments_parent_idx on journal_comments (parent_id);

-- A reply must live on the same journal as its parent, or a thread could be
-- spliced across two pages.
create or replace function guard_comment_parent() returns trigger
language plpgsql as $$
declare parent_journal uuid;
begin
  if new.parent_id is null then return new; end if;
  select journal_id into parent_journal from journal_comments where id = new.parent_id;
  if parent_journal is null or parent_journal <> new.journal_id then
    raise exception 'A reply must belong to the same journal as the comment it answers.';
  end if;
  return new;
end $$;

create trigger journal_comments_parent_guard
  before insert or update on journal_comments
  for each row execute function guard_comment_parent();

alter table journal_comments enable row level security;

-- Read: anyone, but only on a published journal, and only unhidden.
create policy journal_comments_public_read on journal_comments
  for select using (
    not hidden
    and exists (
      select 1 from journals j
      join guides g on g.user_id = j.guide_id
      where j.id = journal_comments.journal_id
        and j.status = 'published'
        and g.status = 'verified'
    )
  );

-- Write: any signed-in user, as themselves, on a published journal.
create policy journal_comments_insert on journal_comments
  for insert to authenticated with check (
    author_id = auth.uid()
    and exists (
      select 1 from journals j
      where j.id = journal_comments.journal_id and j.status = 'published'
    )
  );

-- Edit/remove: your own words only. Ops moderates with the service role.
create policy journal_comments_own_update on journal_comments
  for update to authenticated using (author_id = auth.uid())
  with check (author_id = auth.uid() and hidden = false);

create policy journal_comments_own_delete on journal_comments
  for delete to authenticated using (author_id = auth.uid());

-- The public shape: comment plus who wrote it, and whether they are the guide
-- whose journal it is (their replies get a badge — on a page that exists to
-- prove a person is real, "the guide answered" is the whole point).
create or replace view public_journal_comments as
  select
    c.id,
    c.journal_id,
    c.parent_id,
    c.body,
    c.created_at,
    c.author_id,
    u.full_name  as author_name,
    u.avatar_url as author_avatar_url,
    (c.author_id = j.guide_id) as author_is_guide,
    g.slug as author_guide_slug
  from journal_comments c
  join journals j on j.id = c.journal_id
  join guides jg on jg.user_id = j.guide_id
  join users u on u.id = c.author_id
  left join guides g on g.user_id = c.author_id
  where c.hidden = false
    and j.status = 'published'
    and jg.status = 'verified';

grant select on public_journal_comments to anon, authenticated;

-- Kind on the public journal view, so a card knows which shape to render.
-- Appended at the end (CREATE OR REPLACE rule).
create or replace view public_journals as
  select
    j.id,
    j.slug,
    j.title,
    j.start_date,
    j.end_date,
    (j.end_date - j.start_date + 1) as days,
    j.max_altitude_m,
    j.distance_km,
    j.pass_crossed,
    j.weather_note,
    j.cover_photo_url,
    j.guide_note,
    j.client_note,
    case when j.client_names_ok then j.group_label else j.group_anon end as group_display,
    case when j.client_names_ok then j.client_note_author else null end as client_note_author,
    j.client_photos_ok,
    j.published_at,
    j.guide_id,
    g.slug as guide_slug,
    u.full_name as guide_name,
    u.avatar_url as guide_avatar_url,
    g.tier as guide_tier,
    g.only_with_me as guide_only_with_me,
    g.home_district as guide_district,
    j.route_id,
    r.slug as route_slug,
    r.name as route_name,
    r.region as route_region,
    j.kind,
    (select count(*) from journal_comments c
      where c.journal_id = j.id and c.hidden = false) as comment_count
  from journals j
  join guides g on g.user_id = j.guide_id
  join users u on u.id = j.guide_id
  left join routes r on r.id = j.route_id
  where j.status = 'published' and g.status = 'verified';

grant select on public_journals to anon, authenticated;
