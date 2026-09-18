-- 0090 — one row per photograph, and a constraint that keeps it that way.
--
-- saveOfferingPhotos scoped its delete to the editor's own `source`, so the
-- office and the guide could not see each other's rows. The form posts back
-- every photograph it was shown, so each save re-inserted the whole list under
-- the saver's source while leaving the other editor's copies untouched. The
-- rows multiplied on every save: 23 rows in this table for 11 actual
-- photographs, and one live trip holding nine rows for three pictures.
--
-- The code fix is in app/lib/offerings.server.ts. This clears what it already
-- produced and makes the database refuse to hold the same picture on the same
-- trip twice, so no future editor can reintroduce it.

-- Keep the earliest row for each (trip, picture); it carries the original
-- source and the lowest sort, which is the order somebody actually chose.
-- (This table has no created_at; sort then id is a total order and is stable.)
delete from offering_photos p
where exists (
  select 1 from offering_photos q
  where q.offering_id = p.offering_id
    and q.url = p.url
    and (q.sort, q.id) < (p.sort, p.id)
);

-- A row whose url is blank renders a broken-image glyph and nothing else.
delete from offering_photos where url is null or btrim(url) = '';

-- Close the sort gaps the deletes leave, so "first is the cover" still means
-- the first one.
with ordered as (
  select id, row_number() over (partition by offering_id order by sort, id) - 1 as n
  from offering_photos
)
update offering_photos p set sort = o.n from ordered o where o.id = p.id and p.sort <> o.n;

create unique index if not exists offering_photos_one_per_url
  on offering_photos (offering_id, url);

comment on index offering_photos_one_per_url is
  'The same photograph cannot be on the same trip twice. Added after a
   source-scoped delete let every save duplicate the list (0090).';
