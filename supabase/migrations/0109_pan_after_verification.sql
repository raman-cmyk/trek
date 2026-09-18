-- 0109 — a PAN is a tax number, not a safety check.
--
-- `pan_card` sat in the set of checks every applicant starts with, so the
-- first thing a guide saw after applying was a demand for a tax document from
-- an office they had not joined yet. It says nothing about whether somebody is
-- safe to walk a stranger to 5,364m, and it blocked nothing except the office
-- feeling finished — 54 guides are sitting on a pending PAN right now, none of
-- them chased, none of them blocked.
--
-- It moves to after verification, beside the payout details, where it belongs:
-- it is about paying somebody, not about trusting them.
--
-- The pending rows are marked `not_required` rather than deleted. A guide who
-- already sent one keeps that record; what changes is that nobody is waiting
-- on the ones who did not.

update guide_verifications
   set status = 'not_required',
       notes = coalesce(nullif(btrim(notes), '') || ' · ', '')
               || 'Moved out of verification (0109) — asked for with the payout details instead.'
 where check_type = 'pan_card'
   and status = 'pending';
