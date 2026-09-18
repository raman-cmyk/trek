-- 0102 — a permit has a code, so TIMS can be found by what it is.
--
-- TIMS lives in this codebase twice: as an ordinary `permits` row on two of
-- the six routes, and as its own `tims_cards` table with its own panel and its
-- own issue button. The two models cannot see each other, so `issueTimsCard`
-- will happily print a blue card for an Everest booking whose route has no
-- TIMS permit at all — six have been issued that way — and the office reads
-- "TIMS card issued" beside "no permit application" on the same screen.
--
-- Joining them needs a way to ask "does this route require TIMS?" that does
-- not match the literal string 'TIMS Card'. Hence a code: stable, lowercase,
-- and the thing code branches on, while `name` stays the words on the counter.

alter table permits
  add column if not exists code text;

-- Backfilled from the seeded names. `conservation` splits into acap/mcap
-- because Manaslu Circuit carries both and they are two different permits at
-- two different desks.
update permits set code = case
  when name ilike '%TIMS%'                       then 'tims'
  when name ilike '%National Park%'              then 'park_entry'
  when name ilike '%Municipality%'               then 'municipality'
  when name ilike '%Restricted%'                 then 'restricted'
  when name ilike '%(MCAP)%' or name ilike '%Manaslu Conservation%' then 'mcap'
  when name ilike '%(ACAP)%' or name ilike '%Annapurna Conservation%' then 'acap'
  when name ilike '%Conservation%'               then 'conservation'
  else 'other'
end
where code is null;

alter table permits alter column code set not null;
alter table permits alter column code set default 'other';

-- One of each kind per route. `other` is exempt: it is the bucket for permits
-- we have no name for yet, and two of those on one route is a real thing.
create unique index if not exists permits_one_per_route_code
  on permits (route_id, code) where code <> 'other';

comment on column permits.code is
  'What kind of permit this is: tims, park_entry, municipality, restricted,
   acap, mcap, conservation, other. Code branches on this; `name` is the words
   on the counter. Added in 0102 so TIMS stops being findable only by string
   match on its name.';
