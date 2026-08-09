-- 0006 — Social: messages, reviews, recaps.

create table messages (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid references enquiries(id),
  booking_id uuid references bookings(id),
  sender_id uuid not null references users(id),
  body text not null,                  -- original (stored)
  body_rendered text not null,         -- masked pre-deposit (app/lib/mask.ts)
  flagged_reason text check (flagged_reason in ('phone','email','platform_bypass')),
  created_at timestamptz not null default now(),
  check (enquiry_id is not null or booking_id is not null)
);
alter table messages enable row level security;
-- Thread participants (via the enquiry or booking) + ops.
create policy messages_participant_read on messages for select using (
  public.is_ops()
  or sender_id = auth.uid()
  or exists (select 1 from enquiries e where e.id = enquiry_id
             and (e.trekker_id = auth.uid() or e.guide_id = auth.uid()))
  or exists (select 1 from bookings b where b.id = booking_id
             and (b.trekker_id = auth.uid() or b.guide_id = auth.uid()))
);
create policy messages_sender_create on messages for insert
  with check (sender_id = auth.uid());
create policy messages_ops_all on messages for all
  using (public.is_ops()) with check (public.is_ops());

create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  author_id uuid not null references users(id),
  subject_id uuid not null references users(id),
  direction text not null check (direction in ('trekker_to_guide','guide_to_trekker')),
  overall int not null check (overall between 1 and 5),
  sub_ratings jsonb not null,
  body text,
  published_at timestamptz,            -- null until double-blind release
  guide_reply text,
  created_at timestamptz not null default now(),
  unique (booking_id, direction)
);
alter table reviews enable row level security;
-- Public sees only published trekker→guide reviews; author/subject/ops see own.
create policy reviews_public_read on reviews for select using (
  (published_at is not null and direction = 'trekker_to_guide')
  or author_id = auth.uid()
  or subject_id = auth.uid()
  or public.is_ops()
);
create policy reviews_author_create on reviews for insert
  with check (author_id = auth.uid());
-- Author may edit before publish; a published review is immutable to the author.
create policy reviews_author_update on reviews for update
  using (author_id = auth.uid() and published_at is null);
create policy reviews_ops_all on reviews for all
  using (public.is_ops()) with check (public.is_ops());

create table recaps (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique not null references bookings(id),
  slug text unique not null,           -- public shareable url
  photo_urls text[],
  stats jsonb,
  visible boolean not null default true,
  created_at timestamptz not null default now()
);
alter table recaps enable row level security;
create policy recaps_public_read on recaps for select
  using (visible or public.is_ops());
create policy recaps_ops_write on recaps for all
  using (public.is_ops()) with check (public.is_ops());
