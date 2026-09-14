-- 0082 — Jomsom comes before Marpha.
--
-- On the Annapurna Circuit the itinerary had Day 12 at Marpha and Day 13 at
-- Jomsom. Walking down the Kali Gandaki from Kagbeni you reach Jomsom first
-- and Marpha an hour later — Jomsom is upstream. The route therefore drew
-- itself running south, doubling back north, then south again, which is what
-- the founder saw as "the route is not really making sense".
--
-- Swapping the two places rather than the two days: the days are the
-- itinerary's spine (Day 12 is still Day 12), and it is the villages that
-- were the wrong way round.

update routes
set day_stops = (
  select jsonb_agg(
    case
      when (e->>'day')::int = 12 then e || jsonb_build_object(
        'place', 'Jomsom', 'altitude_m', 2720, 'lat', 28.78, 'lng', 83.732)
      when (e->>'day')::int = 13 then e || jsonb_build_object(
        'place', 'Marpha', 'altitude_m', 2670, 'lat', 28.754, 'lng', 83.686)
      else e
    end
    order by (e->>'day')::int
  )
  from jsonb_array_elements(day_stops::jsonb) e
)
where slug = 'annapurna-circuit'
  -- Only if it is still wrong, so re-running this does not flip them back.
  and exists (
    select 1 from jsonb_array_elements(day_stops::jsonb) e
    where (e->>'day')::int = 12 and e->>'place' = 'Marpha'
  );
