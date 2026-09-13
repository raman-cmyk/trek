-- The permit itself, not just a line saying it exists.
--
-- The tracker recorded a status and a reference number. The trekker's page
-- said "Sagarmatha National Park Entry — ready" and that was all: at the
-- checkpost they had our word for it and nothing to show. Ops now attaches the
-- issued permit (a photograph or the PDF) and the trekker can open it from
-- their own trip.
--
-- Same private bucket as passports, same signed-URL-only rule: the path is
-- stored, never the URL, and nothing is public.
alter table permit_applications
  add column if not exists scan_path text,
  add column if not exists scan_uploaded_at timestamptz,
  add column if not exists scan_uploaded_by uuid references users(id),
  -- Logged by hand rather than created by the confirm trigger. Worth knowing
  -- when a row's history is being read back months later.
  add column if not exists created_by uuid references users(id),
  add column if not exists created_at timestamptz not null default now();

-- One application per permit per booking. Ops can now add these by hand, and
-- the confirm trigger adds them automatically, so the two can collide — and a
-- permit listed twice on a trekker's trip is a question nobody can answer.
-- No live duplicates exist today; a rejected application is excluded so a
-- permit refused once can be filed again.
create unique index if not exists permit_applications_one_live
  on permit_applications (booking_id, permit_id)
  where status <> 'rejected';
