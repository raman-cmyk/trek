-- 0084 — a record of the things only the super admin can do.
--
-- Setting another person's password and signing in as them are the two most
-- dangerous capabilities on this platform, and until now they left no trace
-- at all. That is fine while one person runs everything and indefensible the
-- moment anybody else has ops access — and it is the only evidence that
-- would exist if an account were ever misused from the inside.
--
-- WHAT THIS DELIBERATELY DOES NOT STORE: the password. Not hashed, not
-- masked, not a prefix. The row says that a password was changed, by whom,
-- for whom, and when. Anything more is a second copy of a secret sitting in
-- a table that ops can read.

create table if not exists admin_actions (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),

  -- Who did it. Email as well as id, because the point of an audit row is to
  -- still make sense after the account it refers to has been deleted.
  actor_id uuid references users (id) on delete set null,
  actor_email text not null,

  action text not null check (
    action in ('password_set', 'password_generated', 'entered_account')
  ),

  target_user_id uuid references users (id) on delete set null,
  target_email text,
  -- Free text written by the app, never by a person, and never containing
  -- the secret: see auditNote() in app/lib/admin-password.ts, which takes no
  -- password argument so that it cannot.
  note text not null check (length(note) <= 500)
);

comment on table admin_actions is
  'Super-admin actions on other accounts. Never stores the password itself — only that one was changed, by whom, for whom, and when.';

create index if not exists admin_actions_at_idx on admin_actions (at desc);
create index if not exists admin_actions_target_idx on admin_actions (target_user_id, at desc);

alter table admin_actions enable row level security;

-- Default deny, and it stays denied for everybody, ops included.
--
-- Written and read through the service-role key from the one page that is
-- already gated to the super admin. No policy is created on purpose: an audit
-- log that the people being audited can edit is not an audit log, and RLS
-- with no policy is the clearest way to say so.
