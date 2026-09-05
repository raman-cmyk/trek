-- 0052 — Catch up the guides who were already part-way through.
--
-- 0051's trigger only fires when a check is decided from now on. Guides whose
-- checks were worked on before it existed would sit on "Applied" forever
-- despite the office having got halfway through them. One statement, once.

update guides g
set status = 'in_review'
where g.status = 'applied'
  and exists (
    select 1 from guide_verifications v
    where v.guide_id = g.user_id and v.status <> 'pending'
  );
