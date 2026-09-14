-- 0064 — When you land in Kathmandu.
--
-- A trek has a start date, and everyone has been treating that as the day the
-- trekker arrives in the country. They are rarely the same day. A guide
-- planning an Everest Base Camp departure needs to know when their trekker
-- lands, because that is the day the briefing happens, the day the kit gets
-- checked, and the day it becomes obvious that somebody booked a Lukla flight
-- for a morning they are still in the air.
--
-- Nullable on purpose, and asked for rather than required: plenty of people
-- book the trek before the flight. It is on the enquiry (so a trekker who
-- already knows can say so up front) and on the booking (so it survives the
-- enquiry being tidied away, and so it can be changed later — which is what
-- actually happens, when the flight moves).

alter table enquiries add column if not exists arrival_date date;
alter table bookings add column if not exists arrival_date date;

-- The flight lands before the walk starts. A trekker who types next year's
-- date by mistake should be told, not quietly believed.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_arrival_before_start'
  ) then
    alter table bookings
      add constraint bookings_arrival_before_start
      check (arrival_date is null or arrival_date <= start_date);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'enquiries_arrival_before_start'
  ) then
    alter table enquiries
      add constraint enquiries_arrival_before_start
      check (arrival_date is null or arrival_date <= start_date);
  end if;
end
$$;

comment on column bookings.arrival_date is
  'The day the trekker lands in Kathmandu. Null until they know. Never after
   start_date — the flight lands before the walk begins.';
