-- 0067 — Categories the founder can make, rather than ones a developer can.
--
-- The homepage's rows have been a hard-coded list in app/lib/intents.ts since
-- the beginning: six of them, and a seventh needs a deploy. That is the wrong
-- shape for the thing they are. Which guides to put in front of people is a
-- daily editorial judgement — a festival week, a route that suddenly has four
-- good guides on it, three people who all speak Hebrew — and it belongs to
-- whoever is running the marketplace, not to a release.
--
-- A guide belongs to as many categories as fit. Membership is the founder's
-- own pick, and a category may ALSO name a skill (0062), in which case every
-- guide who claimed that skill is in it without anyone assigning them. Both
-- at once is normal: pick the three you want at the front, and let the rest
-- fill in behind them.

create table categories (
  id uuid primary key default gen_random_uuid(),
  -- The URL: /guides?category=<slug>.
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60),
  -- The row heading, in a reader's words. "Guides who host you in their
  -- village", not "Village Homestay Category".
  label text not null check (length(btrim(label)) between 2 and 80),
  -- The line under it.
  blurb text check (length(blurb) <= 160),
  -- Every guide who ticked this skill is in the category, on top of whoever
  -- was assigned by hand. Null means hand-picked only.
  auto_skill text,

  -- On the homepage, or not yet.
  live boolean not null default false,
  -- Lower first. Ties break on label, so the order is never random.
  sort integer not null default 100,
  -- A row of one reads as a bug rather than a choice, so a category waits
  -- until it has enough people. Editable, because a deliberately tiny row
  -- ("the two women guiding Manaslu") is sometimes exactly the point.
  min_guides integer not null default 3 check (min_guides between 1 and 12),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_touch before update on categories
  for each row execute function public.touch_updated_at();

create table guide_categories (
  category_id uuid not null references categories(id) on delete cascade,
  guide_id uuid not null references guides(user_id) on delete cascade,
  -- Who to show first in the row. Lower first; ties fall back to the guide's
  -- own ranking.
  sort integer not null default 100,
  created_at timestamptz not null default now(),
  primary key (category_id, guide_id)
);
create index guide_categories_guide_idx on guide_categories (guide_id);

alter table categories enable row level security;
alter table guide_categories enable row level security;

-- Public reference data, same as routes: the homepage reads it anonymously.
-- Only what is live, though — an unfinished row is not for readers.
create policy categories_public_read on categories for select using (live);
create policy categories_ops_all on categories for all
  using (public.is_ops()) with check (public.is_ops());

create policy guide_categories_public_read on guide_categories for select using (true);
create policy guide_categories_ops_all on guide_categories for all
  using (public.is_ops()) with check (public.is_ops());

grant select on categories, guide_categories to anon, authenticated;
