-- 0045 — storage for a guide's voice introduction.
--
-- The column (guides.voice_intro_url) and the player (VoiceIntro) have both
-- existed since the profile rebuild, and three seeded guides have a file. What
-- was missing was any way for a guide to record one: there was no bucket that
-- would accept audio, so the most Trek-specific thing on a profile was
-- available only to guides we had seeded by hand.
--
-- Public-read like journal photos, and for the same reason: these play on
-- indexable public pages, so a signed-URL scheme would only mean every profile
-- mints a signature to serve what it is already serving the world. Passport and
-- insurance documents keep their private bucket — that distinction is the
-- point.
--
-- Writes are ops-or-owning-guide only, into guide-audio/<guide_id>/…, the same
-- folder rule the photo buckets use.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'guide-audio',
  'guide-audio',
  true,
  -- 8 MB. A minute of voice off a phone is well under 1 MB; this leaves room
  -- for an uncompressed recording without leaving room for a music file.
  8388608,
  array[
    'audio/mpeg',
    'audio/mp4',
    'audio/m4a',
    'audio/x-m4a',
    'audio/aac',
    'audio/wav',
    'audio/webm',
    'audio/ogg'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists guide_audio_public_read on storage.objects;
create policy guide_audio_public_read on storage.objects
  for select using (bucket_id = 'guide-audio');

drop policy if exists guide_audio_owner_write on storage.objects;
create policy guide_audio_owner_write on storage.objects
  for insert with check (
    bucket_id = 'guide-audio'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists guide_audio_owner_update on storage.objects;
create policy guide_audio_owner_update on storage.objects
  for update using (
    bucket_id = 'guide-audio'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );

drop policy if exists guide_audio_owner_delete on storage.objects;
create policy guide_audio_owner_delete on storage.objects
  for delete using (
    bucket_id = 'guide-audio'
    and (public.is_ops() or (storage.foldername(name))[1] = auth.uid()::text)
  );
