-- 0014 — Public 'photos' bucket for trekker review photos and check-in photos.
-- Public-read (these are meant to be shown once ops approves the row that
-- references them); writes go through the server (service role) only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos', 'photos', true, 10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;
