-- 0027 — Guide change requests. The "request a change to your bio or photos"
-- form on /g/profile previously said "we'll pass it to the team" and wrote
-- NOTHING (audit §10.5). Now it lands in an ops-visible queue.

create table guide_change_requests (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id) on delete cascade,
  note text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  handled_by uuid references users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
alter table guide_change_requests enable row level security;
create policy gcr_own_read on guide_change_requests for select
  using (guide_id = auth.uid() or public.is_ops());
create policy gcr_ops_all on guide_change_requests for all
  using (public.is_ops()) with check (public.is_ops());
create index gcr_status_idx on guide_change_requests(status, created_at desc);

notify pgrst, 'reload schema';
