-- 0041 — Ask me anything: a public Q&A wall on every guide's profile.
--
-- The gap this fills: a trekker deciding between two guides has a specific
-- question — "I am 58 and slow, is Manaslu realistic", "do you carry a pulse
-- oximeter", "what happens if my knee goes on day nine" — and the only place
-- to ask it was a private message. So the answer helped one person, once, and
-- the next forty people with the same question either asked it again or
-- quietly booked elsewhere.
--
-- Three things this earns at the same time:
--
--   · It de-risks the booking. The question a person is too embarrassed to
--     ask has already been asked by somebody else, and answered in the
--     guide's own words.
--   · It is the guide's voice at volume. Fifty short answers written by a
--     named human is the strongest evidence we have that he is not an agency.
--   · It is the best SEO shape there is. Real questions as headings, answered
--     in the first line, marked up as FAQPage — which is exactly what an
--     assistant quotes when somebody asks it the same thing.
--
-- The rule that makes it work: **a question is private until the guide
-- answers it.** Nothing reaches the public page without the guide acting, so
-- the wall is always Q&A pairs rather than a graveyard of ignored questions,
-- and spam dies unseen in a queue instead of being published and moderated.

create table guide_questions (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id) on delete cascade,

  -- Who asked. Signed-in askers get their name from the profile; a signed-out
  -- asker gives a first name so the answer can be addressed to somebody. The
  -- email is never shown — it is only there to tell them they were answered.
  asker_id uuid references users(id) on delete set null,
  asker_name text not null check (length(btrim(asker_name)) between 1 and 40),
  asker_country text check (length(btrim(asker_country)) <= 40),
  asker_email text,

  body text not null check (length(btrim(body)) between 10 and 600),
  answer text check (length(btrim(answer)) between 1 and 2000),
  answered_at timestamptz,

  -- pending  — asked, waiting on the guide. Visible to the guide and ops only.
  -- answered — live on the profile.
  -- declined — the guide chose not to answer. Stays out of sight, is not
  --            deleted, so a pattern of abuse from one account is visible.
  status text not null default 'pending'
    check (status in ('pending', 'answered', 'declined')),

  -- Ops override, separate from the guide's own decision.
  hidden boolean not null default false,
  hidden_reason text,

  -- Sort key for the wall: the questions other trekkers found useful rise.
  helpful_count integer not null default 0 check (helpful_count >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- An answered question has an answer and a date; a pending one has neither.
-- Enforced here because the public view trusts `status` alone.
alter table guide_questions add constraint guide_questions_answer_complete check (
  (status = 'answered' and btrim(coalesce(answer, '')) <> '' and answered_at is not null)
  or (status <> 'answered')
);

create index guide_questions_wall_idx
  on guide_questions (guide_id, helpful_count desc, answered_at desc)
  where status = 'answered' and hidden = false;

create index guide_questions_queue_idx
  on guide_questions (guide_id, created_at)
  where status = 'pending';

create index guide_questions_asker_idx on guide_questions (asker_id);

comment on table guide_questions is
  'Public Q&A on a guide profile. Private until the guide answers — see 0041.';

-- ---------------------------------------------------------------------------
-- Who may see and do what
-- ---------------------------------------------------------------------------
alter table guide_questions enable row level security;

-- Read: answered questions on a verified guide, by anybody. This is the whole
-- point of the wall — it must be readable with no account and no JavaScript.
create policy guide_questions_public_read on guide_questions
  for select using (
    status = 'answered'
    and hidden = false
    and exists (
      select 1 from guides g
      where g.user_id = guide_questions.guide_id and g.status = 'verified'
    )
  );

-- The guide sees their own queue, answered or not.
create policy guide_questions_owner_read on guide_questions
  for select to authenticated using (guide_id = auth.uid());

-- An asker can see their own question while it waits, so "asked 2 days ago"
-- is not a black hole.
create policy guide_questions_asker_read on guide_questions
  for select to authenticated using (asker_id = auth.uid());

-- Ask: any signed-in person, as themselves, of a verified guide. Signed-out
-- asking goes through the server (service role) with a honeypot and a
-- throttle, the same shape as apply.tsx.
create policy guide_questions_insert on guide_questions
  for insert to authenticated with check (
    asker_id = auth.uid()
    and status = 'pending'
    and answer is null
    and exists (
      select 1 from guides g
      where g.user_id = guide_questions.guide_id and g.status = 'verified'
    )
  );

-- Answer: the guide it was asked of, and only the answer-shaped columns. The
-- `with check` keeps a guide from rewriting the question they were asked.
create policy guide_questions_guide_answer on guide_questions
  for update to authenticated
  using (guide_id = auth.uid())
  with check (guide_id = auth.uid() and hidden = false);

-- ---------------------------------------------------------------------------
-- The public shape
-- ---------------------------------------------------------------------------
-- First names only, per the house rule, and no email ever. The country is
-- kept because "Marta, PL" reading a Nepali guide's answer is part of what
-- makes the page feel like a real place.
create or replace view public_guide_questions as
  select
    q.id,
    q.guide_id,
    g.slug as guide_slug,
    u.full_name as guide_name,
    split_part(btrim(q.asker_name), ' ', 1) as asker_first_name,
    q.asker_country,
    q.body,
    q.answer,
    q.answered_at,
    q.helpful_count,
    q.created_at
  from guide_questions q
  join guides g on g.user_id = q.guide_id
  join users u on u.id = q.guide_id
  where q.status = 'answered'
    and q.hidden = false
    and g.status = 'verified';

grant select on public_guide_questions to anon, authenticated;

-- A counter for "12 questions answered" on the profile and the card, without
-- every caller pulling the whole wall.
create or replace view public_guide_question_counts as
  select guide_id, count(*)::int as answered_count
  from public_guide_questions
  group by guide_id;

grant select on public_guide_question_counts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpful votes
-- ---------------------------------------------------------------------------
-- One vote per person per question. A separate table rather than a counter
-- the client can increment: the count is what orders the wall, so it has to
-- be something a person cannot press forty times.
create table guide_question_votes (
  question_id uuid not null references guide_questions(id) on delete cascade,
  voter_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, voter_id)
);

alter table guide_question_votes enable row level security;

create policy guide_question_votes_own on guide_question_votes
  for all to authenticated
  using (voter_id = auth.uid())
  with check (voter_id = auth.uid());

create or replace function sync_question_helpful() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update guide_questions q
     set helpful_count = (
           select count(*) from guide_question_votes v where v.question_id = q.id
         )
   where q.id = coalesce(new.question_id, old.question_id);
  return null;
end $$;

create trigger guide_question_votes_sync
  after insert or delete on guide_question_votes
  for each row execute function sync_question_helpful();
