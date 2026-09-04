-- 0050 — What the office actually checks.
--
-- Three changes, all from how verification is really run in Kathmandu:
--
--  * A PAN card is asked for. It is how a guide is paid legitimately, so it
--    belongs on the checklist rather than in somebody's notes.
--
--  * Not every check applies to every guide. The list had only pending,
--    passed, failed and expired, so a check that simply did not apply sat
--    "pending" forever — and a guide who was fully checked never looked it.
--    'not_required' is the office saying "we looked, this one is not needed",
--    which is a different fact from "we have not got to it yet".
--
--  * Reference calls are dropped. They are not part of the process.

-- Reference rows first — the CHECK cannot be narrowed while they exist.
delete from guide_verifications where check_type in ('reference_1', 'reference_2');

alter table guide_verifications drop constraint guide_verifications_check_type_check;
alter table guide_verifications add constraint guide_verifications_check_type_check
  check (check_type in (
    'licence','id_match','phone','pan_card','payout_account',
    'police_cert','first_aid','altitude_training','insurance'
  ));

alter table guide_verifications drop constraint guide_verifications_status_check;
alter table guide_verifications add constraint guide_verifications_status_check
  check (status in ('pending','passed','failed','expired','not_required'));

-- Every guide already in the system gets the new check, pending, so the office
-- is asked for it rather than it silently never appearing for anyone who
-- applied before today.
insert into guide_verifications (guide_id, check_type, status)
select g.user_id, 'pan_card', 'pending'
from guides g
where not exists (
  select 1 from guide_verifications v
  where v.guide_id = g.user_id and v.check_type = 'pan_card'
);

-- public_guide_verifications filters on status = 'passed', so 'not_required'
-- never reaches a public page. Restated rather than assumed, because this view
-- is what decides which receipts a trekker is shown.
create or replace view public_guide_verifications as
  select
    gv.guide_id,
    gv.check_type,
    gv.verified_at,
    gv.expires_at
  from guide_verifications gv
  join guides g on g.user_id = gv.guide_id
  where g.status = 'verified' and gv.status = 'passed';
