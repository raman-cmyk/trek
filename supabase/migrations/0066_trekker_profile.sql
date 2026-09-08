-- 0066 — The trekker has a profile too.
--
-- The platform is built on knowing who is walking with you, and it has only
-- ever answered that in one direction. A guide decides whether to give up two
-- weeks of their season to a stranger on the strength of a first name, a
-- country code and one line of message. Meanwhile the reviews table has
-- carried a 'guide_to_trekker' direction since 0006, with the same
-- double-blind release as the other way round — written by /g/bookings after
-- every completed trek, and read by nothing at all.
--
-- So this migration adds no reviews table. It adds the part that was actually
-- missing: what a trekker can say about themselves before they have any
-- history, which is every trekker for a while yet.
--
-- The profile itself is NOT public. A guide who has been asked to take
-- somebody may read it, ops may read it, and the trekker may read their own —
-- and that is all. A public page naming somebody's country, their trek
-- history and their dates is a safety problem, most of all for the women
-- trekking alone this platform is trying to serve.

alter table users
  -- Their own words, for the guide deciding whether to take the trip.
  add column about_me text,
  -- How much of this they have done before. A closed list: a guide filters on
  -- it, and free text would give us "beginner", "Beginner" and "first time".
  add column trek_experience text
    check (trek_experience in ('first', 'some', 'lots', 'expert'));

comment on column users.about_me is
  'Trekker-written, shown to guides they have asked. Never public (0066).';
comment on column users.trek_experience is
  'first | some | lots | expert — how much trekking they have done.';
