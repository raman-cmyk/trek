-- One live request per trekker, per trip, per date.
--
-- The application has refused a duplicate ask since 0007-era code was fixed on
-- 2026-09-07: it looks for a twin before inserting. But look-then-insert is not
-- atomic, and the way this bug actually arrives is a double-tap on a slow
-- connection — two requests in flight at once, both looking, both finding
-- nothing, both inserting. The guide then sees the same trek on the same dates
-- twice and cannot tell which one to accept.
--
-- Only 'open' and 'quoted' are covered. A request that was accepted, declined,
-- expired or withdrawn is finished, and asking again afterwards is a real thing
-- a person does: the trip fell through, or they changed their mind back.
create unique index if not exists enquiries_one_live_ask
  on enquiries (trekker_id, offering_id, start_date)
  where status in ('open', 'quoted');

-- And one live booking for the same, which is the other half: once a guide has
-- accepted, asking again for the identical trip and date can only produce a
-- second booking for days the guide has already committed. Cancelled bookings
-- are excluded so a trip that fell through can be rebooked.
create unique index if not exists bookings_one_live_per_trip_date
  on bookings (trekker_id, offering_id, start_date)
  where status not like 'cancelled%';
