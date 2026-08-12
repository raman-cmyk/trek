-- 0043 — Experiences get a review gate.
--
-- Guides can now create and edit their own experiences from the phone
-- (/g/experiences). A new experience must pass the office before it sells:
-- 'pending' sits between draft and live. The public view already shows only
-- 'live', so nothing pending can leak.
alter table offerings drop constraint if exists offerings_status_check;
alter table offerings add constraint offerings_status_check
  check (status in ('draft', 'pending', 'live', 'paused'));
