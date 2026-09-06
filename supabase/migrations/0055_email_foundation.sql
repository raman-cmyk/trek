-- 0055 — The email system's foundation: consent, and a record of every send.
--
-- Trek has thirteen notification functions and has never sent an email to a
-- human being. Before it starts, two things have to exist that do not.
--
-- 1. CONSENT. Marketing email without a recorded opt-in and a working
--    unsubscribe is illegal in the UK, the EU and the US, which is where
--    almost every trekker who books here lives. Transactional mail — your
--    deposit was taken, your guide accepted — is not marketing and is not
--    gated by this; that distinction is enforced in code, not remembered.
--
-- 2. A LOG. Without a record of what was sent to whom there is no way to
--    answer "did the guide actually get told?", no way to see failures, and
--    no way for an automation to promise it will not mail the same person
--    twice. Every automation in stage 5 relies on this table.

-- ---- consent ---------------------------------------------------------------
alter table users
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists consent_source text,
  add column if not exists consent_at timestamptz,
  -- Which kinds of non-essential mail they want. Absent categories mean no.
  add column if not exists email_prefs text[] not null default '{}',
  -- Set when a hard bounce or a complaint comes back: we stop mailing them
  -- entirely, including transactional, because continuing to send to a dead
  -- or hostile address is how a sending domain gets blacklisted.
  add column if not exists email_blocked_at timestamptz,
  add column if not exists email_blocked_reason text;

comment on column users.email_prefs is
  'Opted-in marketing categories: trip_tips, guide_news, offers. Transactional mail ignores this.';

-- ---- the log ---------------------------------------------------------------
create table if not exists email_log (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: we also mail people who have no account yet.
  user_id uuid references users(id) on delete set null,
  to_email text not null,
  -- The template key, e.g. 'guide_welcome'. Automations dedupe on this.
  kind text not null,
  subject text not null,
  -- Transactional always sends; marketing is gated on consent.
  category text not null default 'transactional'
    check (category in ('transactional', 'marketing')),
  status text not null default 'sent'
    check (status in ('sent', 'failed', 'skipped')),
  -- Why it did not go: 'no_consent', 'blocked', 'no_address', or the error.
  detail text,
  provider_id text,                      -- Resend's message id, for support
  -- What it was about, so ops can find "the email about booking X".
  subject_type text,
  subject_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists email_log_user_idx on email_log (user_id, created_at desc);
create index if not exists email_log_kind_idx on email_log (kind, created_at desc);
create index if not exists email_log_created_idx on email_log (created_at desc);
-- The dedupe lookup an automation makes before every send: "have we already
-- sent this person this email about this thing?"
create index if not exists email_log_dedupe_idx
  on email_log (user_id, kind, subject_id) where status = 'sent';

alter table email_log enable row level security;

-- Ops reads it; the service role writes it. A person may see what we sent
-- them, which is both decent and what a GDPR request asks for.
create policy email_log_ops on email_log for all
  using (public.is_ops()) with check (public.is_ops());
create policy email_log_own_read on email_log for select
  using (user_id = auth.uid());

-- ---- unsubscribe tokens ----------------------------------------------------
-- One-click unsubscribe has to work for somebody who is not signed in, from a
-- link that may be years old, without becoming a way to enumerate accounts.
-- A random per-user secret is simplest: it is not derived from the user id,
-- so a token reveals nothing, and rotating it invalidates old links.
alter table users
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists users_unsubscribe_token_idx
  on users (unsubscribe_token);

-- Existing rows all took the same default only if the column already existed;
-- give every row its own.
update users set unsubscribe_token = gen_random_uuid()
where unsubscribe_token is null;

-- ---- who is already opted in ----------------------------------------------
-- Nobody. Consent has never been asked for, so inventing it retroactively
-- would be exactly the thing the law forbids. Everyone starts at false and
-- earns their way in through a real tick box.
