-- 0078 — Doing something about a flagged message.
--
-- Two things are happening in this file.
--
-- FIRST: account_blocks already exists in the production database and has no
-- migration. It was created straight against the database at some point, which
-- means a fresh clone of this repository does not have it and nobody reading
-- the migrations knows it is there. The table below is the live one, written
-- out, so the two agree. `if not exists` makes it a no-op where it already is.
--
-- SECOND: the moderation page had one button — Dismiss — so the only thing the
-- office could do about a guide handing out a WhatsApp number was to pretend
-- it had not happened. "There needs to be a Take action button next to the
-- Dismiss option ... allowing you to choose between blocking, banning, or
-- issuing a warning." A warning is the missing third kind.

create table if not exists account_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null,
  reason text not null,
  starts_at timestamptz not null default now(),
  -- Null means it does not end by itself: a ban, or a warning, which is a
  -- note on the record rather than a thing with a duration.
  ends_at timestamptz,
  blocked_by uuid references users(id),
  -- What the guide's listing status was before we suspended them, so lifting
  -- puts them back where they were rather than guessing "live".
  prior_guide_status text,
  lifted_at timestamptz,
  lifted_by uuid references users(id),
  lift_note text,
  created_at timestamptz not null default now(),
  constraint account_blocks_reason_check
    check (length(btrim(reason)) >= 1 and length(btrim(reason)) <= 500),
  constraint account_blocks_lift_note_check
    check (lift_note is null or length(lift_note) <= 500),
  constraint account_blocks_ends_after_start check (ends_at is null or ends_at > starts_at)
);

create index if not exists account_blocks_user_idx
  on account_blocks (user_id, created_at desc);

-- A warning is now one of the kinds. It restricts nothing — it is on the
-- record, the person is told, and the next person to look at this account
-- sees that they have been told once already.
alter table account_blocks drop constraint if exists account_blocks_kind_check;
alter table account_blocks add constraint account_blocks_kind_check
  check (kind in ('warned', 'suspended', 'banned'));

-- A ban does not expire. Neither does a warning — it has no duration at all.
alter table account_blocks drop constraint if exists account_blocks_ban_is_forever;
alter table account_blocks add constraint account_blocks_ban_is_forever
  check (kind not in ('banned', 'warned') or ends_at is null);

-- At most one RESTRICTION open per person. Warnings are excluded on purpose:
-- somebody warned in March must still be suspendable in April, and the old
-- index — any unlifted row — would have made the warning block the
-- suspension. A warning is never lifted, because there is nothing to lift.
drop index if exists account_blocks_one_open;
create unique index account_blocks_one_open
  on account_blocks (user_id) where lifted_at is null and kind <> 'warned';

alter table account_blocks enable row level security;

-- Ops reads the whole history. Nobody writes through RLS: every block is made
-- by the service-role client from the moderation page, with a name against it.
drop policy if exists account_blocks_ops_read on account_blocks;
create policy account_blocks_ops_read on account_blocks for select using (public.is_ops());

-- A person may read what was done to their own account. Being suspended and
-- not being able to see why is the version of this that generates a furious
-- email; the reason is written to be read by them.
drop policy if exists account_blocks_own_read on account_blocks;
create policy account_blocks_own_read on account_blocks for select using (user_id = auth.uid());
