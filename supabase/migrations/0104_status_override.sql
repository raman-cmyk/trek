-- 0104 — who moved this card, and why.
--
-- `/ops/pipeline`'s action wrote `String(form.get("next"))` with no whitelist.
-- The only bound was the status check constraint, so a card could be dragged
-- from "pending deposit" to "completed" in one gesture and the booking would
-- then say a trek nobody had paid for was finished.
--
-- The rule is in booking-status.ts: the facts' own answer is always allowed,
-- and so is anything behind it, because putting a card back is how a mistake
-- is undone. Moving AHEAD of the facts is somebody overriding what the system
-- can see, and that needs to leave a mark.

alter table bookings
  add column if not exists status_override_reason text,
  add column if not exists status_override_at timestamptz;

comment on column bookings.status_override_reason is
  'Why somebody moved this booking past what its own facts support (0104).
   Written by the pipeline board; cleared by nothing, because the fact that it
   happened does not stop being true.';
