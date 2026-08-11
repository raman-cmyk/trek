-- 0035 — the full route catalogue, and journal tagging.
--
-- Route pages are the primary SEO surface, so the shape has to be data, not
-- code: ops adds a row and a route page exists. These columns are the ones the
-- page renders and cannot fake — distance, the day-by-day stops with their
-- altitudes, and a month-by-month picture of crowds, weather and price.

alter table routes add column if not exists distance_km numeric(6, 1);
alter table routes add column if not exists summary text;
alter table routes add column if not exists start_point text;
alter table routes add column if not exists end_point text;
alter table routes add column if not exists hero_photo_url text;
alter table routes add column if not exists sort int not null default 100;

-- Day stops: the spine of the elevation profile, the map pins and the
-- itinerary, all from one array so they can never disagree.
--   [{ "day":1, "place":"Phakding", "altitude_m":2610, "lng":86.71, "lat":27.74,
--      "note":"Short walk down the valley to shake the flight off." }]
alter table routes add column if not exists day_stops jsonb not null default '[]'::jsonb;

-- Twelve rows, one per month: crowds/weather/cost each 1-5. A heatmap that is
-- honest about October being both the best weather and the worst crowd.
--   [{ "m":1, "crowds":1, "weather":2, "cost":2, "note":"Cold, very quiet." }]
alter table routes add column if not exists month_profile jsonb not null default '[]'::jsonb;

alter table routes add column if not exists faq jsonb not null default '[]'::jsonb;

create index if not exists routes_sort_idx on routes (sort, name);

-- ---- journal tagging --------------------------------------------------------
-- Route is already a column on journals and is the required tag. These are the
-- optional ones: season, conditions, group type, theme. Free-form values in a
-- typed slot, because we do not yet know the vocabulary — the guides' own
-- journals will tell us what it should be.
create table if not exists journal_tags (
  journal_id uuid not null references journals(id) on delete cascade,
  kind text not null check (kind in ('season', 'difficulty', 'group', 'conditions', 'theme')),
  value text not null,
  primary key (journal_id, kind, value)
);

create index if not exists journal_tags_lookup on journal_tags (kind, value);

alter table journal_tags enable row level security;

create policy journal_tags_public_read on journal_tags for select using (true);
create policy journal_tags_owner_write on journal_tags for all
  using (
    public.is_ops()
    or exists (select 1 from journals j where j.id = journal_id and j.guide_id = auth.uid())
  )
  with check (
    public.is_ops()
    or exists (select 1 from journals j where j.id = journal_id and j.guide_id = auth.uid())
  );

-- Tags for a published journal, in one place so the index, the route page and
-- the journal header all read the same rows.
create or replace view public_journal_tags as
  select t.journal_id, t.kind, t.value
  from journal_tags t
  join journals j on j.id = t.journal_id
  join guides g on g.user_id = j.guide_id
  where j.status = 'published' and g.status = 'verified';

grant select on public_journal_tags to anon, authenticated;

-- A journal must name the route it happened on: route pages pull their
-- journals by it, and an untagged journal is invisible to the surface it was
-- written to feed.
create or replace function public.guard_journal_route()
  returns trigger language plpgsql as $$
begin
  if new.status = 'published' and new.route_id is null then
    raise exception 'a published journal must be tagged to a route';
  end if;
  return new;
end;
$$;

drop trigger if exists journals_route_guard on journals;
create trigger journals_route_guard before insert or update on journals
  for each row execute function public.guard_journal_route();

notify pgrst, 'reload schema';
