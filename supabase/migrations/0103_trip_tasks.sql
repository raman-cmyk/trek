-- 0103 — the checklist, as rows.
--
-- The ops spec describes thirty things a trek needs and fifteen an experience
-- needs, each with an owner and a date. Until now the closest thing to that
-- was `trip-readiness.ts`, which derives a handful of steps in memory from
-- payments, documents and permits. Derivation is right for those: a step that
-- reads "balance paid" from the payments table cannot go stale.
--
-- But most of the spec's tasks have no fact behind them. Nothing in this
-- database knows whether the Lukla flights are booked, whether the porter has
-- accepted, whether the briefing pack went out or whether the cash advance
-- was handed over. Those have to be written down by the person who did them,
-- and that is what this table is for.
--
-- Rows are GENERATED from `app/lib/task-template.ts` and never hand-written,
-- so re-running the generator is safe: insert on (booking_id, key) conflict
-- do nothing. Editing the template adds the new tasks to existing trips on
-- the next generation and leaves the done ones alone.

create table if not exists trip_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  -- Stable across regenerations; matches TaskSpec.key.
  key text not null,
  stage text not null,
  label text not null,
  owner text not null check (owner in ('client', 'guide', 'office', 'system')),
  -- The spec's own "Done when", carried so the person doing it reads the same
  -- definition the person who wrote the task had.
  done_when text,
  -- Null where the spec gives no date ("Daily", "As needed"). A made-up date
  -- is a red overdue badge on a task that is not late.
  due_on date,
  state text not null default 'open'
    check (state in ('open', 'done', 'waived', 'blocked')),
  done_at timestamptz,
  done_by uuid references users(id),
  waived_reason text,
  note text,
  created_at timestamptz not null default now(),
  unique (booking_id, key)
);

create index if not exists trip_tasks_booking_idx on trip_tasks (booking_id);
-- The office's own question: what is due, soonest first, across every trip.
create index if not exists trip_tasks_due_idx on trip_tasks (due_on)
  where state = 'open';

-- Waiving a task without saying why is the same failure as rejecting a
-- document without saying why (0073), and gets the same treatment.
alter table trip_tasks
  drop constraint if exists trip_tasks_waived_reason_required;
alter table trip_tasks
  add constraint trip_tasks_waived_reason_required
  check (state <> 'waived' or length(coalesce(waived_reason, '')) >= 3);

-- Done means somebody did it at a time. A row claiming done with neither is a
-- task nobody can be asked about.
alter table trip_tasks
  drop constraint if exists trip_tasks_done_stamped;
alter table trip_tasks
  add constraint trip_tasks_done_stamped
  check (state <> 'done' or done_at is not null);

alter table trip_tasks enable row level security;

-- Ops see and write everything.
drop policy if exists trip_tasks_ops on trip_tasks;
create policy trip_tasks_ops on trip_tasks for all
  using (public.is_ops()) with check (public.is_ops());

-- The trekker sees their own trip's tasks — the spec's "4 of 6 things left
-- before your trek" is this list — but only the ones that are theirs or that
-- tell them where the office has got to. Office and system tasks are on it
-- too: a trekker asking "are my permits done?" is asking a fair question.
drop policy if exists trip_tasks_trekker_read on trip_tasks;
create policy trip_tasks_trekker_read on trip_tasks for select using (
  exists (select 1 from bookings b where b.id = booking_id and b.trekker_id = auth.uid())
);

-- The guide sees the trips they are walking. Their own tasks are the point;
-- the rest is the context that stops them ringing the office to ask.
drop policy if exists trip_tasks_guide_read on trip_tasks;
create policy trip_tasks_guide_read on trip_tasks for select using (
  exists (select 1 from bookings b where b.id = booking_id and b.guide_id = auth.uid())
);

comment on table trip_tasks is
  'The ops spec checklist as rows (0103). Generated from task-template.ts when
   a booking is paid for; never hand-written. Facts that live elsewhere —
   payments, documents, permits — stay derived in trip-readiness.ts; this
   table is for the work nothing else knows about.';
