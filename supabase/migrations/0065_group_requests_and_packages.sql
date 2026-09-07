-- 0065 — The guide says yes first, and can propose a package to a group.
--
-- The group flow ran in the wrong order. A group could invite everybody, split
-- the money and collect it, and only then ask the guide — who might say no, or
-- not be free, or want a different itinerary. Worse, the gate that let the
-- organiser ask at all required every share to be paid first, and nobody can
-- pay a share of a trip that has no booking behind it. So the sequence people
-- were asked to follow could not actually be walked.
--
-- The order the product means is: pick the trip, ask the guide, the guide
-- agrees, THEN invite the others, then everyone pays their own share. Two
-- columns carry it — which request the group is waiting on, and when the guide
-- said yes — plus two statuses for the states in between.
--
-- And a group is a conversation like any other, so a guide should be able to
-- do in it the thing they can do in a one-to-one thread: propose a different
-- package. A proposal can now belong to a group.

alter table trip_groups
  add column enquiry_id uuid references enquiries(id) on delete set null,
  add column guide_accepted_at timestamptz;

alter table trip_groups drop constraint if exists trip_groups_status_check;
alter table trip_groups add constraint trip_groups_status_check
  check (status in ('forming', 'requested', 'accepted', 'ready', 'booked', 'cancelled'));

comment on column trip_groups.enquiry_id is
  'The request the guide is answering. Set when the organiser asks (0065).';
comment on column trip_groups.guide_accepted_at is
  'When the guide agreed. Invites are locked until this is set.';

create index if not exists trip_groups_enquiry_idx on trip_groups (enquiry_id);

-- A package proposed to a group, rather than to one trekker.
alter table package_proposals
  add column if not exists group_id uuid references trip_groups(id) on delete cascade;

alter table package_proposals drop constraint if exists package_proposals_has_a_home;
alter table package_proposals add constraint package_proposals_has_a_home
  check (enquiry_id is not null or conversation_id is not null or group_id is not null);

create index if not exists package_proposals_group_idx
  on package_proposals (group_id, created_at desc);
