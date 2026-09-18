-- 0097 — remember that a trekker asked us to sort out their insurance.
--
-- The "leave the insurance with us" button sent two emails and wrote nothing
-- down. One went to the trekker saying a real person was on it, and one to
-- hello@guidesofnepal.com. If that mailbox is not being watched — or, as
-- today, if RESEND_API_KEY is not set at all — the request simply does not
-- exist anywhere. The trekker has been told somebody is dealing with it and
-- nobody is.
--
-- A promise made by the product has to survive the notification that carried
-- it. This is the row that makes the ask real: the office can see it on the
-- booking and in the insurance queue whether or not any email arrived.

alter table bookings add column if not exists insurance_help_asked_at timestamptz;
alter table bookings add column if not exists insurance_help_asked_by uuid references users(id);
-- Closed when the office has come back to them with a policy, so the queue
-- empties rather than growing for ever.
alter table bookings add column if not exists insurance_help_closed_at timestamptz;

comment on column bookings.insurance_help_asked_at is
  'When the trekker asked us to arrange cover for them (0097). The ask is
   recorded before the emails go out, so a mail failure cannot lose it.';

create index if not exists bookings_insurance_help_idx
  on bookings (insurance_help_asked_at)
  where insurance_help_asked_at is not null and insurance_help_closed_at is null;
