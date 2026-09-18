-- 0092 — a routes view that carries only the line, not the prose.
--
-- The homepage pulls every route to draw the atlas. `day_stops` is 34 KB of
-- the 38 KB it receives, and most of that is text the homepage never shows:
-- each stop carries a note (the day-by-day description), plus km, hours and
-- sleep, which only the route page reads. The atlas needs five fields per
-- stop — the day, the place, the height and the two coordinates.
--
-- The worker pays CPU to receive, parse and re-serialise all of it, and
-- Cloudflare has been killing 2-3% of requests with "exceeded resources".
-- This is the largest single thing the homepage asks for.
--
-- A view rather than a column so there is nothing to keep in sync: it reads
-- the same day_stops the route page does, and drops what the map cannot draw.
--
-- security_invoker is the whole safety of this. `routes` hides a pending route
-- from everyone but the office and the guide who wrote it (0046), and the
-- homepage relies on that rather than filtering by status. A view defaults to
-- running as its owner, which would have handed the atlas every unreviewed
-- route a guide had typed. Invoker means this reads with exactly the rights
-- the caller has, so it is the table it replaces in every way that matters.

create or replace view public.route_lines
with (security_invoker = true) as
select
  r.id,
  r.slug,
  r.name,
  r.region,
  r.typical_days,
  r.max_altitude_m,
  r.difficulty,
  r.sort,
  (
    select jsonb_agg(
             jsonb_build_object(
               'day', d->'day',
               'place', d->'place',
               'altitude_m', d->'altitude_m',
               'lat', d->'lat',
               'lng', d->'lng'
             )
             order by coalesce((d->>'day')::int, 0)
           )
    from jsonb_array_elements(coalesce(r.day_stops, '[]'::jsonb)) as d
  ) as day_stops
from routes r;

grant select on public.route_lines to anon, authenticated, service_role;

comment on view public.route_lines is
  'Routes with day_stops reduced to what a map can draw. The homepage atlas
   reads this instead of routes, which halves what the worker parses (0092).';
