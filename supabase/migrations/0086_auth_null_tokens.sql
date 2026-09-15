-- 0086 — the two rows that made the whole admin user directory fail.
--
-- /ops/users reported "Database error finding users" and then, with a
-- straight face, "0 accounts" and "Nobody matches" — on a platform with 72.
--
-- The cause is not our code. GoTrue's admin list endpoint scans these columns
-- into Go strings, which cannot hold NULL, so ONE row with a NULL token makes
-- the entire listUsers call fail — not that row, all of them. Two seeded
-- accounts (gyaljen@example.com, maya@example.com) were inserted with NULLs,
-- and took the directory down with them.
--
-- Empty string is what GoTrue itself writes when there is no token in flight,
-- so this restores the invariant rather than inventing one. It is idempotent
-- and safe to run against a database that is already clean.
--
-- NOTE for anyone adding seed users: insert '' for these, never NULL, and
-- never let a NULL back in. supabase/seed.sql is fixed alongside this.

update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where
  confirmation_token is null
  or recovery_token is null
  or email_change is null
  or email_change_token_new is null
  or email_change_token_current is null
  or phone_change is null
  or phone_change_token is null
  or reauthentication_token is null;
