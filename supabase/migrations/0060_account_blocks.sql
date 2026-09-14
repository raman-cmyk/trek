-- 0060 — Blocking an account.
--
-- Until now the only lever the office had against a person was a guide's
-- status ("suspended", "removed"), which hides them from the public site and
-- nothing else: they could still sign in, message, and enquire. A trekker
-- could not be stopped at all. Blocking is the missing lever, for anyone.
--
-- A block is a row, not a flag on users, because the office needs the story:
-- who blocked whom, why, until when, who lifted it and what they said. One
-- open block per person at a time (the partial unique index); a new block
-- lifts the old one first.
--
-- Two kinds:
--   suspended — for a while (ends_at) or until somebody lifts it (ends_at null).
--   banned    — for good. ends_at is always null.
--
-- Enforcement happens in three places, all reading this table:
--   • Supabase Auth gets a matching ban_duration, so a fresh sign-in fails.
--   • requireUser / requireOps check is_blocked() on every request, so a
--     session that was already open is signed out and sent to /blocked.
--   • A guide's status is set to suspended/removed while the block stands
--     (prior_guide_status remembers what to put back).

create table if not exists account_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('suspended', 'banned')),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  blocked_by uuid references users(id) on delete set null,
  prior_guide_status text,
  lifted_at timestamptz,
  lifted_by uuid references users(id) on delete set null,
  lift_note text check (lift_note is null or length(lift_note) <= 500),
  created_at timestamptz not null default now(),
  constraint account_blocks_ban_is_forever check (kind <> 'banned' or ends_at is null),
  constraint account_blocks_ends_after_start check (ends_at is null or ends_at > starts_at)
);

create index if not exists account_blocks_user_idx on account_blocks (user_id, created_at desc);
create unique index if not exists account_blocks_one_open on account_blocks (user_id)
  where lifted_at is null;

alter table account_blocks enable row level security;

-- The office reads; every write goes through the service role from the app.
-- Nobody sees their own block row — they are told on /blocked in plain words.
create policy account_blocks_ops_read on account_blocks
  for select using (public.is_ops());

-- One question the app asks on every request: is this person blocked now?
create or replace function public.is_blocked(uid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from account_blocks
    where user_id = uid
      and lifted_at is null
      and (ends_at is null or ends_at > now())
  );
$$;

revoke all on function public.is_blocked(uuid) from public, anon;
grant execute on function public.is_blocked(uuid) to authenticated, service_role;
