-- 0062 — What a guide is interesting for.
--
-- The backlog has carried this since the homepage rework: the "browse by
-- intent" rows match keywords against the guide's own free text, so
-- "Photographers" is a substring search for "camera" and a guide who phrased
-- their promise differently is invisible to the row built for them
-- (app/lib/intents.ts says so in its own comment).
--
-- A licence says somebody may lead a trek. It says nothing about whether they
-- know the birds, cook, or are the person you want when your fourteen-year-old
-- is struggling on day four — which is what a trekker is actually choosing
-- between. This is that, as a column we can filter.
--
-- The vocabulary lives in app/lib/guide-skills.ts rather than in a CHECK here:
-- a closed list that a product decision can extend without a migration, with
-- writes validated in the action that makes them.

create table if not exists guide_skills (
  guide_id uuid not null references guides(user_id) on delete cascade,
  skill text not null,
  created_at timestamptz not null default now(),
  primary key (guide_id, skill)
);

create index if not exists guide_skills_skill_idx on guide_skills (skill);

alter table guide_skills enable row level security;

-- Public: this is on the guide's page and is the thing people filter by.
drop policy if exists guide_skills_public_read on guide_skills;
create policy guide_skills_public_read on guide_skills for select using (true);

-- A guide claims their own; ops can correct.
drop policy if exists guide_skills_own_write on guide_skills;
create policy guide_skills_own_write on guide_skills
  for all to authenticated
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());

notify pgrst, 'reload schema';
