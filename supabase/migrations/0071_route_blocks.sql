-- 0071 — Route pages become blocks somebody can order, rather than code.
--
-- The Langtang Valley page is the best thing on this site: a page that climbs,
-- one photograph and one paragraph per day, the background cooling from forest
-- green to alpine white as you scroll. It exists as a TypeScript constant in
-- app/lib/climb.ts, hand-written, one route deep. Every other route gets the
-- standard layout, and giving a second route the good page means a developer,
-- a deploy, and a file nobody but a developer can open.
--
-- That is the wrong shape. A route page is editorial: the photographs change,
-- a section is worth moving up, a new one is worth trying. So a page is now an
-- ordered list of typed blocks, edited in the console.
--
-- Ten kinds, deliberately closed (app/lib/route-blocks.ts). An open schema
-- becomes a page builder, a page builder becomes a CMS, and a CMS is a project
-- rather than a feature. Ten covers the Langtang page and everything the
-- standard one does.

create table route_blocks (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete cascade,

  -- One of the ten. Checked in the app rather than here: the vocabulary lives
  -- in one TypeScript file that the editor, the renderer and the tests all
  -- read, and a second copy in SQL is a second thing to forget.
  kind text not null check (length(kind) between 2 and 40),

  -- Lower first. Gaps are deliberate — moving a block is a swap of two
  -- numbers, not a renumbering of the page.
  sort integer not null default 100,

  -- The block's own fields. Shape depends on the kind; normalised on the way
  -- in and on the way out, so a block written by an older version of the
  -- editor still renders.
  data jsonb not null default '{}'::jsonb,

  -- Draft until it is not. A half-written block must not appear on a page
  -- that is already taking bookings.
  live boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger route_blocks_touch before update on route_blocks
  for each row execute function public.touch_updated_at();

create index route_blocks_route_idx on route_blocks (route_id, sort);

alter table route_blocks enable row level security;

-- Public reference data, like the routes themselves — but only what is live.
create policy route_blocks_public_read on route_blocks for select using (live);
create policy route_blocks_ops_all on route_blocks for all
  using (public.is_ops()) with check (public.is_ops());

grant select on route_blocks to anon, authenticated;
