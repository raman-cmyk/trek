-- 0079 — Notifications, in the app.
--
-- "When a guide books a date and the trip shows deposit due, nothing shows up
-- — I don't get a notification in app or through email."
--
-- Two separate faults behind one symptom. The email is real and correct and
-- has never once left the building: every one of the 39 emails this platform
-- has ever composed is logged `skipped / no_api_key`, because RESEND_API_KEY
-- is not set in Cloudflare. That is a key, not a bug.
--
-- The in-app half simply did not exist. There was no table, no bell and no
-- page — the only way the platform ever told anybody anything was an email it
-- could not send. So a trekker whose guide had just accepted found out by
-- going and looking.
--
-- Rows here are written at the same moment an email is composed, BEFORE the
-- part that needs a key. The app can therefore tell people things while the
-- email channel is down, which is the situation it has been in since the
-- first day.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- Matches email_log.kind, so the two sides of one event can be lined up.
  kind text not null,
  title text not null,
  body text,
  -- Where it takes you. A notification you cannot act on is a worry, not news.
  href text,
  about_type text,
  about_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title_check check (length(btrim(title)) between 1 and 200),
  constraint notifications_body_check check (body is null or length(body) <= 1000)
);

create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);

-- The count on the bell, which is read on every page load for every signed-in
-- person. It must not be a scan.
create index if not exists notifications_unread_idx
  on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

-- Yours and nobody else's. Writes happen through the service-role client at
-- the moment the thing they describe happens, never from a browser.
drop policy if exists notifications_own_read on notifications;
create policy notifications_own_read on notifications for select using (user_id = auth.uid());

-- Marking one read is the only thing a person may change, and only on their
-- own. The check on both sides stops a row being handed to somebody else.
drop policy if exists notifications_own_update on notifications;
create policy notifications_own_update on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
