-- 0031 — guide_languages was invisible to the public. Same class of bug as
-- 0016 (guide_photos): RLS enabled, one owner/ops policy, and no public read.
--
-- Anonymous visitors have been getting zero rows since 0001, which silently
-- broke four things nobody could see failing:
--   · the language line on every guide card ("Nepali · English · Sherpa")
--   · the "Any language" filter on /guides — it matched nothing, always
--   · the languages row on the guide profile
--   · the matcher's language score, which could never fire
--
-- Languages are already published on the profile page by design; there is
-- nothing private here. The write policy is untouched, so a guide still only
-- edits their own.

create policy guide_languages_public_read on guide_languages
  for select using (true);

notify pgrst, 'reload schema';
