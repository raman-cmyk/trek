-- 0105 — checklists the office can write, instead of checklists we ship.
--
-- Three hardcoded lists had grown up in three different shapes:
--
--   * guide verification — `CHECK_TYPES` in guide-checks.ts, rows in
--     `guide_verifications`, one list for every guide whether they walk to
--     Everest Base Camp or run a momo tour in Thamel;
--   * a trek's 30 tasks and a day experience's 13 — `task-template.ts`, rows
--     in `trip_tasks` (0103);
--   * nothing at all for putting an experience live.
--
-- Every one of them is the office's own process, and every change to one
-- needed a deploy. The founder cannot deploy. So the lists become data: a
-- template anybody can edit, and a run of that template against a guide, an
-- experience or a booking.
--
-- `trip_tasks` is a day old and is generalised rather than duplicated —
-- having two task models is the mistake 0102 was written to undo.

-- ── the template ────────────────────────────────────────────────────────

create table if not exists checklists (
  id uuid primary key default gen_random_uuid(),
  -- What this list is about. The scope decides what a run can attach to and
  -- who is allowed to see it.
  scope text not null check (scope in ('booking', 'guide', 'offering')),
  -- Stable handle, so seeded lists can be found and updated by name rather
  -- than by whichever uuid the database happened to mint.
  key text not null unique,
  name text not null check (length(btrim(name)) >= 2),
  description text,
  /*
   * Which subjects this list is for, as plain keys the office chooses.
   *
   *   booking  → offering kinds: trek, day_hike, food_culture, adventure, city
   *   offering → the same kinds
   *   guide    → free labels the office uses for its own sorting
   *              ("trek guide", "day guide", "food host"). Nothing in the
   *              data says what kind of guide somebody is, so for now these
   *              are a hint and ops picks the list; when guides carry a type
   *              this becomes the auto-match.
   *
   * Empty means "never automatic" — somebody has to start it by hand.
   */
  applies_to text[] not null default '{}',
  -- The one that runs when a subject matches nothing more specific.
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_at timestamptz not null default now()
);

create index if not exists checklists_scope_idx on checklists (scope) where active;

create table if not exists checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists(id) on delete cascade,
  -- Unique within its list, and the key a generated task carries, so editing
  -- a label never orphans the rows already ticked against it.
  key text not null,
  label text not null check (length(btrim(label)) >= 2),
  -- The heading it sits under. Free text: the office's own grouping, not ours.
  stage text not null default 'General',
  owner text not null default 'office'
    check (owner in ('client', 'guide', 'office', 'system')),
  -- The spec's "done when" column: what finishing it actually looks like.
  done_when text,
  /*
   * What the due date counts from.
   *   start   — the trip's departure, or the experience's slot (T-minus)
   *   created — when the run was started (a guide's papers, "within 7 days")
   *   none    — no date at all. "Daily", "As needed", "Once".
   * A made-up date is a red overdue badge on something that is not late.
   */
  anchor text not null default 'none' check (anchor in ('start', 'created', 'none')),
  offset_days integer,
  position integer not null default 0,
  -- A required item blocks the list from ever reading as complete; an
  -- optional one is there when it applies and ignored when it does not.
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (checklist_id, key)
);

create index if not exists checklist_items_list_idx
  on checklist_items (checklist_id, position) where active;

-- An anchor of `none` has nothing to offset from, and an offset with no
-- anchor is a number nobody can read.
alter table checklist_items
  drop constraint if exists checklist_items_offset_needs_anchor;
alter table checklist_items
  add constraint checklist_items_offset_needs_anchor
  check (anchor <> 'none' or offset_days is null);

-- ── the run ─────────────────────────────────────────────────────────────

-- `trip_tasks` becomes the general table. Bookings keep their own foreign key
-- so a deleted booking still takes its tasks with it; guides and offerings
-- are reached through `subject_id`.
alter table trip_tasks rename to checklist_tasks;

alter table checklist_tasks
  add column if not exists subject_type text not null default 'booking',
  add column if not exists subject_id uuid,
  add column if not exists checklist_id uuid references checklists(id) on delete set null,
  add column if not exists position integer not null default 0;

update checklist_tasks set subject_id = booking_id where subject_id is null;

alter table checklist_tasks alter column booking_id drop not null;
alter table checklist_tasks alter column subject_id set not null;

alter table checklist_tasks
  drop constraint if exists checklist_tasks_subject_type_check;
alter table checklist_tasks
  add constraint checklist_tasks_subject_type_check
  check (subject_type in ('booking', 'guide', 'offering'));

-- A booking-scoped task must carry the foreign key that cascades; the other
-- two scopes must not, because they are not bookings.
alter table checklist_tasks
  drop constraint if exists checklist_tasks_booking_fk_matches_scope;
alter table checklist_tasks
  add constraint checklist_tasks_booking_fk_matches_scope
  check (
    (subject_type = 'booking' and booking_id is not null and booking_id = subject_id)
    or (subject_type <> 'booking' and booking_id is null)
  );

-- One row per item per subject. The old unique was on (booking_id, key),
-- which cannot express a guide's list.
alter table checklist_tasks drop constraint if exists trip_tasks_booking_id_key_key;
create unique index if not exists checklist_tasks_one_per_subject
  on checklist_tasks (subject_type, subject_id, key);

create index if not exists checklist_tasks_subject_idx
  on checklist_tasks (subject_type, subject_id);

-- ── who sees what ───────────────────────────────────────────────────────

alter table checklists enable row level security;
alter table checklist_items enable row level security;

-- The templates are the office's own process. Everyone signed in may READ
-- them — a guide's own checklist is meaningless if they cannot see what is on
-- it — and only ops may write.
drop policy if exists checklists_read on checklists;
create policy checklists_read on checklists for select using (auth.uid() is not null);
drop policy if exists checklists_ops on checklists;
create policy checklists_ops on checklists for all
  using (public.is_ops()) with check (public.is_ops());

drop policy if exists checklist_items_read on checklist_items;
create policy checklist_items_read on checklist_items for select using (auth.uid() is not null);
drop policy if exists checklist_items_ops on checklist_items;
create policy checklist_items_ops on checklist_items for all
  using (public.is_ops()) with check (public.is_ops());

-- The task rows. Ops everything; the trekker their own trip; the guide their
-- own trips AND their own verification list, which is the one they most need
-- to see and never could.
drop policy if exists trip_tasks_ops on checklist_tasks;
drop policy if exists checklist_tasks_ops on checklist_tasks;
create policy checklist_tasks_ops on checklist_tasks for all
  using (public.is_ops()) with check (public.is_ops());

drop policy if exists trip_tasks_trekker_read on checklist_tasks;
drop policy if exists checklist_tasks_trekker_read on checklist_tasks;
create policy checklist_tasks_trekker_read on checklist_tasks for select using (
  subject_type = 'booking'
  and exists (select 1 from bookings b where b.id = subject_id and b.trekker_id = auth.uid())
);

drop policy if exists trip_tasks_guide_read on checklist_tasks;
drop policy if exists checklist_tasks_guide_read on checklist_tasks;
create policy checklist_tasks_guide_read on checklist_tasks for select using (
  (subject_type = 'booking'
    and exists (select 1 from bookings b where b.id = subject_id and b.guide_id = auth.uid()))
  or (subject_type = 'guide' and subject_id = auth.uid())
  or (subject_type = 'offering'
    and exists (select 1 from offerings o where o.id = subject_id and o.guide_id = auth.uid()))
);

comment on table checklists is
  'Checklist templates the office writes and edits (0105). One per area —
   guide verification, putting an experience live, running a trek, running a
   day experience — and as many more as the office wants. Runs land in
   checklist_tasks.';
