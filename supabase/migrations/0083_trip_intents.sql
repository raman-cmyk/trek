-- 0083 — "When are you planning your Nepal trip?"
--
-- The first question we ask a stranger, three seconds after they land, and
-- the only one whose answer we keep before they have an account.
--
-- Three shapes of answer, all first-class, because most people genuinely do
-- not have dates yet and a form that only accepts dates is a form they close:
--
--   dates   they know: 2-16 October.
--   season  they know roughly: autumn, next spring.
--   unsure  they do not know. That is real data about a real visitor, not a
--           failed conversion, and it is stored as itself rather than as a
--           made-up date we would then act on.
--
-- One row per answer, not one per person: somebody who comes back in March
-- with dates after browsing in September has told us something new, and
-- overwriting the first answer would lose the more interesting half of it.

create table if not exists trip_intents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  email text not null,
  -- Set once the account exists. Null only if account creation failed, which
  -- must not lose the lead.
  user_id uuid references users (id) on delete set null,

  mode text not null check (mode in ('dates', 'season', 'unsure')),
  -- Present when mode = 'dates'. Never invented for the other two.
  start_date date,
  end_date date,
  -- Present when mode = 'season': 'autumn' | 'spring' | 'winter' | 'summer'.
  season text,

  party_size int check (party_size is null or (party_size between 1 and 16)),

  -- Where they were standing when we asked, and how they got to us. Both
  -- useful for the only question this table exists to answer: which traffic
  -- turns into a trek.
  source_path text,
  referrer text,

  -- True once the welcome email actually left the building. Not "we called
  -- send" — see email_log. Lets us find leads nobody ever heard back from,
  -- which is the exact failure mode this platform has been in with RESEND
  -- unset.
  welcomed_at timestamptz,

  constraint trip_intents_dates_ordered
    check (start_date is null or end_date is null or end_date >= start_date),
  constraint trip_intents_dates_present
    check (mode <> 'dates' or (start_date is not null and end_date is not null)),
  constraint trip_intents_season_present
    check (mode <> 'season' or season is not null)
);

comment on table trip_intents is
  'Answers to the "when are you coming?" popup. One row per answer, kept even after the account exists, so a change of plan is visible rather than overwritten.';

-- "Who told us about a trip and never heard back" and "what is coming this
-- season" are the two reads. Both are time-ordered.
create index if not exists trip_intents_created_idx on trip_intents (created_at desc);
create index if not exists trip_intents_email_idx on trip_intents (lower(email));
create index if not exists trip_intents_unwelcomed_idx
  on trip_intents (created_at desc) where welcomed_at is null;

alter table trip_intents enable row level security;

-- Default deny, and it stays denied for everybody.
--
-- No public select policy: this table is a list of email addresses belonging
-- to people who have not signed in yet, and there is no screen where a
-- visitor needs to read one. Writes come from the server action on the
-- service-role key, which bypasses RLS by design; ops reads the same way.
-- A signed-in person may read their OWN answers back, which is what makes
-- "we saved your trip" on their account page honest rather than a claim.
drop policy if exists trip_intents_own_select on trip_intents;
create policy trip_intents_own_select on trip_intents
  for select
  using (user_id is not null and user_id = auth.uid());
