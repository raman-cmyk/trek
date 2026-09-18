-- 0093 — remove the group pages that were made for people trekking alone.
--
-- groupForBooking was meant to skip a solo booking. Its guard read
-- `party_size < 2 and enquiry_id is null`, and the second half undid the
-- first: a booking's enquiry_id is set on essentially every booking, because
-- an enquiry is how a trek gets booked. So every solo trek fell through and
-- got a group of its own — one member, no one to invite, and a first line
-- reading "The guide confirmed <date> for 1. Invite the others and split it
-- here." They then filled up /groups, which is supposed to list the trips you
-- are planning with other people.
--
-- The code is fixed; this clears what it already made. Deliberately narrow:
-- one seat sold, one member, no package proposal, and nothing in the room
-- anyone typed. A group that fails any of those is somebody's real trip and
-- is left exactly where it is. Members, messages and mutes cascade.

delete from trip_groups g
where g.party_target < 2
  and exists (
    select 1 from bookings b where b.id = g.booking_id and b.party_size < 2
  )
  and (select count(*) from trip_group_members m where m.group_id = g.id) = 1
  and not exists (select 1 from package_proposals p where p.group_id = g.id)
  and not exists (
    select 1 from trip_group_messages gm
    where gm.group_id = g.id and coalesce(gm.kind, '') <> 'system'
  );
