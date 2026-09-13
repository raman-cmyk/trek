-- 0075 — storage for profile photographs.
--
-- Until now the only way anybody's face reached `users.avatar_url` was an ops
-- admin pasting a URL into a text box on /ops/people/:id. A trekker filling in
-- the profile a guide reads before agreeing to take them into the mountains
-- was looking at a grey circle with no way to change it.
--
-- Public bucket, deliberately narrow read policy. The two halves matter
-- separately:
--
--   * `public = true` means the object endpoint serves a file to anyone
--     holding its exact URL, with no signature to mint. That is what makes an
--     avatar cheap to show in a message thread, a roster and a booking screen
--     without every page signing a dozen URLs.
--
--   * the select policy below governs the *authenticated* storage API, which
--     is what `list()` goes through. Without it, anyone could enumerate every
--     object in the bucket and walk away with a directory of trekkers' faces —
--     and the trekker profile page promises the opposite in as many words:
--     "never public — only a guide you have asked, and our office."
--
-- So: not enumerable, and not indexable, but reachable by exact path. A face
-- is not a passport; passports keep their private bucket and their signed URLs
-- (0013), and that distinction is the point.
--
-- Uploads pass through /api/avatar, which strips the GPS pointer out of the
-- EXIF first (app/lib/exif.ts). A selfie taken in the kitchen carries the
-- coordinates of the kitchen.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB: a face, not a landscape
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Listing and authenticated reads: your own folder, or ops.
create policy avatars_own_read on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Writes are always your own folder: avatars/<user_id>/...
create policy avatars_own_write on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy avatars_own_update on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy avatars_own_delete on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );
