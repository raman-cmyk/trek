-- 0047 — A record of who changed a guide's listing.
--
-- The office edits listings on a guide's behalf — that is the concierge model,
-- not an exception to it. But a guide whose price or itinerary changed
-- overnight, with no note and no name against it, has been given a reason to
-- distrust the platform holding their money. Every ops edit is now written
-- down and the guide is told.
--
-- Only what actually changed is stored, as before/after pairs, so the row is
-- readable a year later without diffing two snapshots by eye.

create table if not exists offering_edits (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references offerings(id) on delete cascade,
  editor_id uuid not null references users(id),
  editor_role text not null check (editor_role in ('guide', 'ops')),
  changed jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists offering_edits_offering_idx
  on offering_edits (offering_id, created_at desc);

alter table offering_edits enable row level security;

-- The guide whose listing it is can read their own history; ops reads all.
-- Nobody updates or deletes an entry — an audit trail that can be edited is
-- not one.
create policy offering_edits_read on offering_edits for select using (
  public.is_ops()
  or exists (
    select 1 from offerings o
    where o.id = offering_edits.offering_id and o.guide_id = auth.uid()
  )
);
create policy offering_edits_insert on offering_edits for insert with check (
  public.is_ops()
  or exists (
    select 1 from offerings o
    where o.id = offering_edits.offering_id and o.guide_id = auth.uid()
  )
);
