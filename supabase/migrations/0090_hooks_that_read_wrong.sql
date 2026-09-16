-- Three guide hooks that say the opposite of what they mean.
--
-- Each was written as a safety promise and reads as something else to a
-- stranger who has never met the person saying it:
--
--   "If you come alone, I sleep in your room."      Meant: a solo woman is
--   "I share a room with you if you come alone."    not left alone in a
--                                                   teahouse. Reads, to a
--                                                   woman deciding whether to
--                                                   trust a man in Nepal she
--                                                   has never met, as a
--                                                   threat. It is the single
--                                                   worst sentence on the site.
--
--   "I tell you honestly how far the helicopter     Meant: I know the
--    is."                                           evacuation options. Reads
--                                                   as: you may need a
--                                                   helicopter. Nobody books
--                                                   a trek while thinking
--                                                   about helicopters.
--
-- The fix keeps each guide's actual promise and removes the reading they did
-- not intend. Both women's hooks now name who is protected and why, which is
-- the reassurance they were reaching for; the third says what the guide
-- actually knows, without the aircraft.
--
-- Data, not code: these are rows in `guides.only_with_me`, so the seed file is
-- updated alongside for a fresh clone.

update guides g
set only_with_me = v.line
from (values
  ('sunita-gurung',  'Travelling alone? You share my room, not a stranger''s.'),
  ('sarita-gurung',  'Women trekking solo stay in my family''s room, not alone.'),
  ('tenzing-bhote',  'I know where the nearest help is, every day of the walk.')
) as v(slug, line)
where g.slug = v.slug;
