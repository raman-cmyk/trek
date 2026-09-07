-- 0056 — The guide belongs in the group chat.
--
-- 0039 made a trip group deliberately private to its members: four friends
-- deciding whether to add a rest day is not a conversation the guide needs to
-- be in. In practice the first thing a group does is ask a question only the
-- guide can answer — "can we add Tilicho?", "how cold at Thorong Phedi?" —
-- and the organiser ends up relaying it through the booking thread, badly.
--
-- So the guide the group is planning with (trip_groups.guide_id) can now read
-- the group and post in its chat, exactly like a member. What the guide still
-- cannot do is anything that changes the trip: no inviting, no removing, no
-- payment mode, no cancelling. Those stay the organiser's.

create or replace function is_group_guide(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_groups g where g.id = gid and g.guide_id = auth.uid());
$$;

drop policy if exists trip_groups_read on trip_groups;
create policy trip_groups_read on trip_groups
  for select to authenticated
  using (
    organiser_id = auth.uid()
    or is_group_member(id)
    or is_group_guide(id)
    or is_ops()
  );

-- The guide sees who is coming — that is the party they are guiding — but the
-- policy is read-only, so they cannot alter the roster or anyone's share.
drop policy if exists trip_group_members_read on trip_group_members;
create policy trip_group_members_read on trip_group_members
  for select to authenticated
  using (
    is_group_member(group_id)
    or is_group_organiser(group_id)
    or is_group_guide(group_id)
    or is_ops()
  );

drop policy if exists trip_group_messages_read on trip_group_messages;
create policy trip_group_messages_read on trip_group_messages
  for select to authenticated
  using (
    is_group_member(group_id)
    or is_group_organiser(group_id)
    or is_group_guide(group_id)
    or is_ops()
  );

drop policy if exists trip_group_messages_insert on trip_group_messages;
create policy trip_group_messages_insert on trip_group_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      is_group_member(group_id)
      or is_group_organiser(group_id)
      or is_group_guide(group_id)
    )
  );

notify pgrst, 'reload schema';
