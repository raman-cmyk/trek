-- 0098 — one insurer, one spelling.
--
-- `insurance_provider` was free text validated by `.trim() || null`, and
-- eleven bookings ended up carrying four "insurers":
--
--   world nomads   4      wolrd nomads   4      xyz   2      abcd   1
--
-- Seven of the eleven are the same company, split down the middle by one
-- transposed letter. That is the case a junk-rejecting rule would have waved
-- through, because "wolrd nomads" is not junk — it is a typo, and the only
-- cure for a typo is not typing. The form is a picker from today (validate.ts).
--
-- This repairs what the free-text field already wrote. Only the unambiguous
-- collapse: the two World Nomads spellings become the list's own label. "xyz"
-- and "abcd" are left exactly as they are — they are not a misspelling of
-- anything, and deciding what an insurer called "xyz" really was is the
-- office's job, not a migration's.

update bookings
   set insurance_provider = 'World Nomads'
 where lower(btrim(insurance_provider)) in ('world nomads', 'wolrd nomads');
