-- 0061 — Where to meet, as a fact about the booking.
--
-- "Where to meet" is a step on every short trip's track, and nothing could
-- ever complete it. It sat lit up on a paid, confirmed food tour with no
-- address on the screen and no button to press, because the step was tied to
-- the booking status and the address lived somewhere else entirely: in the
-- offering's `meeting_point`, printed only inside the trek pre-trek brief,
-- with the time buried in the first row of the itinerary JSON.
--
-- Three things change:
--
--   1. `offerings.meet_time` — the hour a day experience starts, as a column
--      rather than a string inside a JSON blob. Backfilled from the first
--      itinerary row that carries one, which is where every seeded experience
--      keeps it ("18:00 · Meet in Thamel").
--
--   2. Meeting details on the booking itself. The offering says where the
--      trip usually starts; this booking may start at the guide's shop at
--      half five because there are two of them and it is raining. A guide
--      setting these is the trigger that completes the step, and
--      `meeting_set_at` is what the trekker's screen means by "confirmed by
--      your guide" as opposed to "from the experience".
--
--   3. `meet_time` on public_offerings, so the public experience page and the
--      group page can say what time the thing starts.
--
-- No booking is backfilled: a booking with nothing of its own falls back to
-- its offering, which is what the app already does in resolveMeeting().

alter table offerings add column if not exists meet_time time;

update offerings o
set meet_time = t.val::time
from (
  select
    o2.id,
    (
      select e ->> 'time'
      from jsonb_array_elements(o2.itinerary) e
      where e ->> 'time' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]'
      limit 1
    ) as val
  from offerings o2
  where jsonb_typeof(o2.itinerary) = 'array'
) t
where t.id = o.id
  and t.val is not null
  and o.meet_time is null;

alter table bookings
  add column if not exists meeting_point text,
  add column if not exists meeting_time time,
  add column if not exists meeting_note text,
  add column if not exists meeting_set_at timestamptz,
  add column if not exists meeting_set_by uuid references users(id) on delete set null;

-- No new write policy. An update policy for guides would have to be written
-- against the whole row, so "the guide may set the meeting point" would also
-- read "the guide may set total_usd_cents" — the app writes these through the
-- service role after checking the booking is theirs, and the trekker reads
-- them through the participant-read policy that already exists.

-- The public view, with the start time appended. Existing columns keep their
-- order, so `create or replace` is allowed to do this.
create or replace view public_offerings as
 SELECT o.id,
    o.slug,
    o.kind,
    o.route_id,
    o.title,
    o.summary,
    o.days,
    o.price_usd_cents,
    o.max_party,
    o.min_party,
    o.meeting_point,
    o.included,
    o.excluded,
    o.itinerary,
    o.cover_photo_url,
    o.created_at,
    g.user_id AS guide_id,
    g.slug AS guide_slug,
    split_part(btrim(u.full_name), ' '::text, 1) AS guide_name,
    u.avatar_url AS guide_avatar_url,
    g.tier AS guide_tier,
    g.day_rate_usd_cents AS guide_day_rate_usd_cents,
    o.price_breakdown,
    r.max_altitude_m,
    bg.slug AS backup_guide_slug,
    split_part(btrim(bu.full_name), ' '::text, 1) AS backup_guide_name,
    bu.avatar_url AS backup_guide_avatar_url,
    g.porter_welfare AS guide_porter_welfare,
    r.slug AS route_slug,
    r.name AS route_name,
    r.region AS route_region,
    o.updated_at,
    o.meet_time
   FROM offerings o
     JOIN guides g ON g.user_id = o.guide_id
     JOIN users u ON u.id = g.user_id
     LEFT JOIN routes r ON r.id = o.route_id
     LEFT JOIN guides bg ON bg.user_id = o.backup_guide_id AND bg.status = 'verified'::text
     LEFT JOIN users bu ON bu.id = bg.user_id
  WHERE o.status = 'live'::text AND g.status = 'verified'::text;
