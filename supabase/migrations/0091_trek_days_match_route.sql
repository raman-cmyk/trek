-- 0091 — a trek is exactly as long as its route.
--
-- The listing form asked for the length and the route already knew it, so the
-- two drifted: twelve live trips were listed at a length their own route does
-- not have, one of them at twelve days on an eight-day route.
--
-- It is not a harmless disagreement. The itinerary a trekker reads is built
-- from the route's day stops, so any day beyond the route's count is a day the
-- page cannot show — the trip claims twelve days and describes eight.
--
-- The rule is now enforced in the form (read-only once a route is picked) and
-- on the server for every create and edit path (daysFromRoute in
-- app/lib/offerings.server.ts). This brings the rows that already drifted into
-- line. Trips with no route are untouched: a momo crawl has no route to be as
-- long as.
--
-- A guide who wants to run a route slower now adds the day to the ROUTE, which
-- is a panel inside the listing form rather than a separate page.

update offerings o
set days = r.typical_days
from routes r
where r.id = o.route_id
  and r.typical_days is not null
  and r.typical_days > 0
  and o.days <> r.typical_days;

-- Price breakdowns carry the trip length too, and per-day lines multiply by
-- it. Left disagreeing, a trip would be charged for days it no longer runs.
update offerings o
set price_breakdown = jsonb_set(o.price_breakdown, '{days}', to_jsonb(o.days))
where o.price_breakdown ? 'days'
  and (o.price_breakdown->>'days')::int is distinct from o.days;
