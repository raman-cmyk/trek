-- 0063 — Emergency contacts, for both sides of the trek.
--
-- Somebody has a bad day at 4,000m and the guide has a satellite phone and no
-- idea who to call. Two columns for this have existed since 0001, marked
-- "trekker only", and nothing has ever written to them but the ops console —
-- no trekker was ever asked, and no guide was ever asked at all, so when a
-- guide broke an ankle above Namche the office spent an afternoon ringing
-- round to find his brother.
--
-- So: the same two columns, now filled by the people they are about, plus the
-- two things missing from them. Who the person is ("partner", "mother") is
-- what turns a name into a call somebody is willing to make at 3am, and an
-- email is the only channel that works when a foreign number will not connect
-- from a Nepali sim.
--
-- On users, not on bookings: a next of kin is a fact about a person, not
-- about one trek, and a trekker who books twice should not have to type it
-- twice. It is also what makes this work for guides, who have no booking of
-- their own to hang it from.

alter table users
  add column emergency_contact_relationship text,
  add column emergency_contact_email text;

comment on column users.emergency_contact_name is
  'Next of kin. Trekkers AND guides (0063) — the guide is the one nobody could reach.';
comment on column users.emergency_contact_phone is
  'With country code. Read by the guide on the trail, by ops, and by nobody else.';
