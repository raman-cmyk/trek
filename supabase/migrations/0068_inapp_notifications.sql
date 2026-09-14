-- 0068 — the notification bell, and the table it needs.
--
-- Every notification this platform sends goes to email or to SMS. Neither has
-- a key in production: 39 rows in email_log, all of them
-- "skipped · no_api_key", nothing delivered since the day the code was
-- written. A guide whose client cancels is told nothing. A trekker whose guide
-- accepts is told nothing.
--
-- So `notifications` exists — with owner read and owner update policies, and
-- 38 rows whose titles match email subjects exactly — but no migration ever
-- created it, no code in this repository has ever written to it, and no screen
-- has ever read it. It is drift from an earlier build: the table somebody
-- meant to fill, left behind.
--
-- This adopts it. Same shape, recorded here so a fresh clone has it; the
-- indexes a bell needs; and the policies stated rather than inherited.
-- Writing is the service role's alone — an in-app notification a user could
-- insert is a notification a user could forge.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- The template key, the same one email_log records, so one moment can be
  -- traced across both channels.
  kind text not null,
  title text not null,
  body text,
  -- Where it leads. Always one of our own paths; hrefFor() refuses the rest.
  href text,
  about_type text,
  about_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- The bell's query: this person's, newest first.
create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);

-- The badge's query: how many has this person not seen.
create index if not exists notifications_unread_idx
  on notifications (user_id)
  where read_at is null;

alter table notifications enable row level security;

-- Yours to read and yours to mark read. Nothing else.
drop policy if exists notifications_own_read on notifications;
create policy notifications_own_read on notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_own_update on notifications;
create policy notifications_own_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- No insert and no delete policy, deliberately. The service role writes these
-- after it has established the event actually happened; a client that could
-- insert one could tell somebody their deposit had been refunded.

comment on table notifications is
  'The in-app half of every notification. Exists because email and SMS both
   depend on a third-party key: when Resend or Sparrow is unconfigured, down,
   or blocked by a carrier, this is still delivered. Written by the service
   role only.';

-- The 38 orphan rows stay. They are real events for real users, they carry
-- the right user_id, and none has ever been seen — so they are a genuine
-- backlog rather than noise, and deleting somebody's history to tidy a table
-- is not a trade worth making.
