-- 0115 — Make "send this once" a fact the database enforces.
--
-- Every dedupe in this codebase is read-then-write with nothing behind it.
-- `alreadySent` counts email_log rows; trip-nudge selects from notifications
-- before inserting; group-notify reads the last send time. Each is a SELECT
-- and then an INSERT with no transaction and no constraint in between, so two
-- runs that overlap both read "not sent" and both send.
--
-- email_log_dedupe_idx (0055) looks like the missing constraint and is not:
-- it is a plain index, for speed. Nothing in the schema has ever made a
-- double-send impossible.
--
-- That was invisible while nothing sent. Scheduled mail is exactly the case
-- that breaks it — a sweep overlapping a user action, or a retried cron
-- invocation — and the failure is a trekker getting the same email twice,
-- which is the fastest way to teach somebody to ignore us.
--
-- So: claim first, send second. A sender inserts its claim, and a unique
-- violation (23505) means somebody else already holds it, so it sends
-- nothing. The race is decided by Postgres rather than by luck.
--
-- Not a unique index on email_log itself: `record()` wraps its insert in
-- try/catch, so a violation there would silently skip the LOG while the email
-- still went out — the worst of both worlds.
--
-- subject_id is the thing the mail is about (a booking, an enquiry, a group).
-- It is nullable for sends that are about nothing in particular, and because
-- Postgres treats NULLs as distinct in a unique index, those would not dedupe
-- against each other — so the index below coalesces it to the nil UUID.

create table if not exists email_claims (
  id uuid primary key default gen_random_uuid(),
  -- Nullable, like email_log.user_id: a lead with no account can be mailed.
  user_id uuid references users(id) on delete cascade,
  -- The template key. Stable by contract — see notify.server kindFromSubject,
  -- which derives one from the subject line and must never be used here.
  kind text not null,
  subject_id uuid,
  claimed_at timestamptz not null default now()
);

-- The point of the whole migration. coalesce(), so that two claims with no
-- subject collide as they should rather than both being allowed through.
create unique index if not exists email_claims_once
  on email_claims (
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    kind,
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- For sweeping old claims, and for answering "when did we last tell them?"
create index if not exists email_claims_claimed_idx on email_claims (claimed_at desc);

alter table email_claims enable row level security;

-- Nobody reads this but the office; it is written by the service role only.
create policy email_claims_ops on email_claims for all using (public.is_ops());

notify pgrst, 'reload schema';
