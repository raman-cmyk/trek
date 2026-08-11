-- 0039 — Trip groups: go together, and settle up honestly.
--
-- Four people who met on Reddit want to walk Manaslu. Today one of them has
-- to front the whole cost, chase the other three over WhatsApp, and hope
-- nobody drops out after the deposit is non-refundable. That is not a booking
-- problem, it is a group problem, and it happens off the platform where we
-- cannot help.
--
-- A trip group is the container for the part that happens before a booking:
-- who is coming, where the conversation lives, and how the money is split.
-- When it is ready it becomes exactly one ordinary booking — the group does
-- not fork the booking model, it feeds it.
--
-- Payment modes:
--   organiser — one person pays the whole trip. The others just come.
--   split     — everyone pays their own share. The booking waits until the
--               shares that must be in are in.

create table trip_groups (
  id uuid primary key default gen_random_uuid(),
  -- Short, unguessable, and the URL: /groups/<slug>. Not a sequential id,
  -- because a group page names everybody who is going.
  slug text not null unique,
  name text not null check (length(btrim(name)) between 2 and 80),
  organiser_id uuid not null references users(id) on delete cascade,

  -- The trip. Nullable while a group is still deciding — people form the
  -- group first and pick the trek second more often than the reverse.
  offering_id uuid references offerings(id) on delete set null,
  guide_id uuid references guides(user_id) on delete set null,
  start_date date,

  party_target integer not null default 2 check (party_target between 1 and 24),
  payment_mode text not null default 'split' check (payment_mode in ('organiser', 'split')),

  status text not null default 'forming'
    check (status in ('forming', 'ready', 'booked', 'cancelled')),
  -- Set once the group turns into a real booking; the group page becomes a
  -- read-only record of who paid what.
  booking_id uuid references bookings(id) on delete set null,

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trip_groups_organiser_idx on trip_groups (organiser_id);
create index trip_groups_offering_idx on trip_groups (offering_id);

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------
-- An invited member may not have an account yet, so a row can carry an email
-- with a null user_id until they sign in and claim it.

create table trip_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references trip_groups(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  invited_email text,
  display_name text not null,
  role text not null default 'member' check (role in ('organiser', 'member')),
  status text not null default 'invited'
    check (status in ('invited', 'joined', 'declined', 'removed')),

  -- What this person owes and has paid. Shares are recomputed whenever the
  -- trip or the roster changes; paid only ever goes up.
  share_usd_cents integer not null default 0 check (share_usd_cents >= 0),
  paid_usd_cents integer not null default 0 check (paid_usd_cents >= 0),

  joined_at timestamptz,
  created_at timestamptz not null default now()
);

-- One row per person per group. Two partial indexes rather than one composite:
-- an invite by email and a joined account are different keys, and a group can
-- hold several not-yet-claimed invites.
create unique index trip_group_members_user_uniq
  on trip_group_members (group_id, user_id) where user_id is not null;
create unique index trip_group_members_email_uniq
  on trip_group_members (group_id, lower(invited_email)) where invited_email is not null;
create index trip_group_members_user_idx on trip_group_members (user_id);

-- ---------------------------------------------------------------------------
-- Group chat
-- ---------------------------------------------------------------------------
-- Deliberately its own table rather than reusing conversations/messages: a
-- trekker-to-guide thread is masked, moderated and part of the booking record.
-- This is four friends deciding whether to add a rest day.

create table trip_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references trip_groups(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  -- System lines ("Marie joined", "Tom paid his share") read in the same
  -- stream as the conversation, which is where they make sense.
  kind text not null default 'message' check (kind in ('message', 'system')),
  created_at timestamptz not null default now()
);

create index trip_group_messages_group_idx on trip_group_messages (group_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Membership is the whole access rule, so it gets a security-definer helper.
-- Without SECURITY DEFINER the members policy would query trip_group_members
-- from inside a trip_group_members policy and recurse.

create or replace function is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from trip_group_members m
    where m.group_id = gid and m.user_id = auth.uid() and m.status in ('invited', 'joined')
  );
$$;

create or replace function is_group_organiser(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from trip_groups g where g.id = gid and g.organiser_id = auth.uid());
$$;

alter table trip_groups enable row level security;
alter table trip_group_members enable row level security;
alter table trip_group_messages enable row level security;

-- A group is visible to its members and to ops. Not public: it names people
-- and their dates.
create policy trip_groups_read on trip_groups
  for select to authenticated
  using (organiser_id = auth.uid() or is_group_member(id) or is_ops());

create policy trip_groups_insert on trip_groups
  for insert to authenticated with check (organiser_id = auth.uid());

create policy trip_groups_organiser_update on trip_groups
  for update to authenticated
  using (organiser_id = auth.uid() or is_ops())
  with check (organiser_id = auth.uid() or is_ops());

create policy trip_group_members_read on trip_group_members
  for select to authenticated
  using (is_group_member(group_id) or is_group_organiser(group_id) or is_ops());

-- Joining: you may add yourself. The organiser may add anyone. Nobody else.
create policy trip_group_members_insert on trip_group_members
  for insert to authenticated
  with check (user_id = auth.uid() or is_group_organiser(group_id) or is_ops());

create policy trip_group_members_update on trip_group_members
  for update to authenticated
  using (user_id = auth.uid() or is_group_organiser(group_id) or is_ops())
  with check (user_id = auth.uid() or is_group_organiser(group_id) or is_ops());

create policy trip_group_messages_read on trip_group_messages
  for select to authenticated
  using (is_group_member(group_id) or is_group_organiser(group_id) or is_ops());

create policy trip_group_messages_insert on trip_group_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (is_group_member(group_id) or is_group_organiser(group_id))
  );

-- ---------------------------------------------------------------------------
-- Payments, per member
-- ---------------------------------------------------------------------------
-- In split mode each member pays their own share, so a payment belongs to a
-- person as well as to a booking. Nullable: every payment made before groups
-- existed belongs to the booker alone.

alter table payments add column group_member_id uuid references trip_group_members(id);
create index payments_group_member_idx on payments (group_member_id) where group_member_id is not null;

-- 'share' is a deposit paid by one member of a split group.
alter table payments drop constraint payments_type_check;
alter table payments add constraint payments_type_check
  check (type in ('deposit', 'balance', 'full', 'refund', 'share'));
