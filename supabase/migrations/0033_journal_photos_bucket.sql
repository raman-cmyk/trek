-- 0033 — storage for journal photography.
--
-- Public-read: these photos are the product, they sit on indexable pages, and
-- a signed-URL scheme would only mean every journal page mints a hundred
-- signatures to show what it is already showing the world. Passport and
-- insurance documents keep their private bucket and their signed URLs — that
-- distinction is the point, not an oversight.
--
-- Writes are ops-or-owning-guide only, and uploads pass through
-- /api/journal-photo, which strips the GPS pointer out of the EXIF before a
-- byte reaches this bucket (app/lib/exif.ts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'journal-photos',
  'journal-photos',
  true,
  10485760, -- 10 MB: a phone photo, not a RAW file
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may look at a published journal's photos.
create policy journal_photos_public_read on storage.objects
  for select using (bucket_id = 'journal-photos');

-- A guide writes only into their own folder: journal-photos/<guide_id>/...
create policy journal_photos_guide_write on storage.objects
  for insert with check (
    bucket_id = 'journal-photos'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy journal_photos_guide_update on storage.objects
  for update using (
    bucket_id = 'journal-photos'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );

create policy journal_photos_guide_delete on storage.objects
  for delete using (
    bucket_id = 'journal-photos'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );
