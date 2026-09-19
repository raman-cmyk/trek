-- 0113 — what kind of guide somebody is.
--
-- Two earlier migrations predicted this column and worked around not having
-- it, in their own words:
--
--   0105: "Nothing in the data says what kind of guide somebody is, so for
--          now these are a hint and ops picks the list; when guides carry a
--          type this becomes the auto-match."
--   0106: "Nothing in the data says which kind of guide somebody is —
--          `guides` has a tier and a list of regions and no type."
--
-- The consequence reached the application form. Every applicant was asked for
-- a trekking licence number, its expiry and a photograph of the card, and
-- could not go on without them — so a momo-crawl host had to produce a
-- trekking licence they have no reason to hold, while a heritage walk through
-- Pashupatinath, which does need a licensed guide, was checked against the
-- wrong card entirely.
--
-- The vocabulary is `offerings.kind`, not a new one. What a guide says they
-- will run and what they can then list are the same five words, so the
-- booking pipeline, the pricing components, the per-kind checklists and this
-- all agree without translation.
--
-- Nothing is backfilled to a guess. Every existing guide gets `{trek}`,
-- which is what the form already forced them to be: all 56 applied under a
-- flow that demanded a trekking licence, and 54 of them have one on file.

alter table guides
  add column if not exists guide_kinds text[] not null default '{}';

-- The same five as offerings.kind (0002_catalog.sql:42). A guide may run
-- several; an empty array means they have not said, which is only true of
-- rows created before this column existed.
alter table guides drop constraint if exists guides_guide_kinds_check;
alter table guides add constraint guides_guide_kinds_check check (
  guide_kinds <@ array['trek','day_hike','food_culture','adventure','city']::text[]
);

comment on column guides.guide_kinds is
  'What this guide runs, from the offerings.kind vocabulary. Decides which '
  'licence the application asks for (app/lib/guide-licence.ts) and which '
  'office checklist they are run against (guide_trek / guide_day, 0106).';

create index if not exists guides_kinds_idx on guides using gin (guide_kinds);

-- Everyone already here applied under the trekking-licence flow, so that is
-- what they are until they or the office say otherwise. This is a statement
-- of what happened, not a guess about what they do.
update guides set guide_kinds = array['trek'] where cardinality(guide_kinds) = 0;

-- A guide may set their own, like regions and languages; status, tier and the
-- licence number stay ops-controlled by the guard trigger (0001).
