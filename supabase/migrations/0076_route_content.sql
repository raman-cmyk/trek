-- 0076 — What a route page has to answer.
--
-- Put our route page beside nepalhightrek.com or trekthehimalayas.com and the
-- difference is not design, it is content. Theirs answer the fifty questions a
-- person actually has before they fly: how many hours do I walk, where do I
-- sleep, is there a shower, can I charge a phone, what do I carry, what does
-- the helicopter cost if it goes wrong. Ours answered five.
--
-- Two kinds of content, kept apart on purpose:
--
--   * Route-specific — the columns below. Different for every walk, so they
--     live in the database and ops edits them without a deploy.
--   * Universal — altitude, water, insurance, money, power, tipping, etiquette.
--     The same on every trek in Nepal, so it is written ONCE in
--     app/lib/trek-knowledge.ts, parameterised by this route's real altitude
--     and permits. The competitors copy-paste theirs onto every page and it
--     drifts; ours cannot.
--
-- The day-by-day is not a column. `day_stops` already holds the days, and its
-- objects simply gain optional keys — `hours`, `km`, `sleep` — so a day can
-- say "5–6 hours, 14 km, teahouse at Namche". Ascent and descent are NOT
-- stored: they are computed from the altitudes already in the row
-- (app/lib/trek-day.ts), because a stored copy of a derived number is a stored
-- copy that goes stale.

alter table routes
  -- The dozen lines that make somebody want this walk rather than another.
  add column if not exists highlights text[],
  -- Several paragraphs. The summary is one sentence for a card; this is the
  -- piece somebody reads when they are deciding.
  add column if not exists overview text,
  -- How you physically get to the start and back from the end: the drive, the
  -- flight, the hours, what it costs. Route-specific and the single most
  -- searched practical question after price.
  add column if not exists getting_there text,
  -- What the lodges are actually like ON THIS ROUTE — "teahouses the whole way,
  -- twin rooms to Manang, dormitory at Thorong Phedi" — not the generic answer.
  add column if not exists accommodation text,
  -- Food on this route: where it stops being varied, where dal bhat is the
  -- only safe bet, local dishes worth having.
  add column if not exists food text,
  -- Anything this walk needs that a normal trek does not: crampons for a pass,
  -- a four-season bag for camping, a sleeping bag liner for a restricted area.
  add column if not exists packing_extra text[],
  -- Water on this route: where the plastic ban bites, where the last shop is.
  add column if not exists water_note text;

comment on column routes.highlights is
  'Route-specific. The universal practical content lives in app/lib/trek-knowledge.ts.';
comment on column routes.day_stops is
  'Array of {day, place, altitude_m, lat, lng, note, hours?, km?, sleep?}. Ascent and descent are computed from altitude_m, never stored.';
