-- 0057 — Muting a trip, so the group chat can email people.
--
-- Group chat has been silent by design: it appears in the inbox and nowhere
-- else, because fanning a notification out to a whole roster is a decision
-- about somebody's attention, not a feature. Email makes it sendable — it is
-- free, it is what trekkers read, and unlike SMS it does not cost per person
-- per message.
--
-- What has to exist before it sends is the way out. One table, because the
-- guide is in the group chat too (0056) and has no roster row to hang a
-- column off — a mute keyed on (group, user) covers everyone in the room the
-- same way.

create table if not exists trip_group_mutes (
  group_id uuid not null references trip_groups(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists trip_group_mutes_user_idx on trip_group_mutes (user_id);

alter table trip_group_mutes enable row level security;

-- Your own mutes, and nobody else's. There is nothing here for an organiser
-- or ops to change: whether you want to hear about a trip is yours alone.
drop policy if exists trip_group_mutes_own on trip_group_mutes;
create policy trip_group_mutes_own on trip_group_mutes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
