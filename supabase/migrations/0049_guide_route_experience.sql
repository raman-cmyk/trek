-- 0049 — Which trails a guide has actually walked, and how many times.
--
-- Until now the public profile answered "Routes Mingma has walked" by counting
-- his published journals. A guide who has walked Manaslu forty times and
-- written two write-ups showed "×2". The number on the most important line of
-- a guide's profile measured our content, not their life.
--
-- The application now asks them directly. The claim is theirs until the office
-- checks it, which is what verified_by/verified_at are for — the count shows
-- straight away, and a confirmed one is marked as confirmed.

create table if not exists guide_route_experience (
  guide_id uuid not null references guides(user_id) on delete cascade,
  route_id uuid not null references routes(id) on delete cascade,
  -- Bounded: a guide leading twenty treks a year for twenty-five years is at
  -- five hundred. A larger number is a typo, not a career.
  times_walked int not null check (times_walked between 1 and 500),
  verified_by uuid references users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (guide_id, route_id)
);

create index if not exists guide_route_experience_route_idx
  on guide_route_experience (route_id);

alter table guide_route_experience enable row level security;

-- The guide owns their record; the office corrects it.
create policy guide_route_experience_owner on guide_route_experience for all
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());

-- Public read, stated here rather than forgotten. guide_languages shipped in
-- 0001 without one and anon silently read zero rows for thirty migrations —
-- the card language line, the browse filter and the matcher were all quietly
-- broken until 0031 noticed. This table feeds the public profile, so it says
-- so on the first day.
create policy guide_route_experience_public_read on guide_route_experience
  for select using (true);
