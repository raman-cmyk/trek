-- 0107 — a request whose trip was cancelled says so.
--
-- `cancelBooking` touches bookings, instalments, availability and payments,
-- and has never touched enquiries. So a request that was accepted stays
-- accepted after the trip it produced is cancelled — for ever.
--
-- That is not a rare corner. Every single accepted request in production —
-- all seven — is sitting behind a cancelled booking, which is why the trek
-- page kept telling the trekker "pratik said yes. Finish it in My trips."
-- about a trip that no longer exists.
--
-- `withdrawn` would have been the cheap answer and it is the wrong word: the
-- trekker withdrawing a request before anyone answered and a booked trip
-- being cancelled months later are different events, and the guide's own
-- request list should be able to tell them apart.

alter table enquiries drop constraint if exists enquiries_status_check;
alter table enquiries
  add constraint enquiries_status_check
  check (status in (
    'open', 'quoted', 'accepted', 'declined',
    'withdrawn', 'expired', 'converted', 'cancelled'
  ));

-- The seven. Matched through the booking rather than by date, because a
-- trekker can have asked the same guide about the same trip twice.
update enquiries e
   set status = 'cancelled'
  from bookings b
 where b.enquiry_id = e.id
   and b.status like 'cancelled%'
   and e.status in ('accepted', 'converted');

comment on column enquiries.status is
  'open → quoted → accepted → converted is the happy path. declined, expired
   and withdrawn are the ways a request ends before a trip exists; cancelled
   (0107) is the way it ends after one did.';
