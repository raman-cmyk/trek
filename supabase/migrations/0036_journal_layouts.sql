-- Two more photo shapes for a day block.
--
-- The public page already rotates layouts so no two adjacent days share a grid
-- (app/lib/journals.ts layoutFor), but a guide who *knows* day 9 was a
-- three-photo morning or a single wide panorama should be able to say so. The
-- CHECK was written before those shapes existed and would reject them.

alter table journal_entries
  drop constraint if exists journal_entries_layout_check;

alter table journal_entries
  add constraint journal_entries_layout_check
  check (layout in ('full', 'two', 'three', 'portrait', 'pano'));
