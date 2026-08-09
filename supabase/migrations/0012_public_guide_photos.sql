-- 0012 — Public read of a verified guide's photos (for the profile carousel).
-- Additive permissive policy: anon/authenticated may read guide_photos only
-- when the owning guide is verified. (The owner/ops write policy stays.)

create policy guide_photos_public_read on guide_photos for select
  using (
    exists (
      select 1 from guides g
      where g.user_id = guide_photos.guide_id and g.status = 'verified'
    )
  );
