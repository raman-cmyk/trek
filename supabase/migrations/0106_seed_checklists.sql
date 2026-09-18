-- 0106 — the checklists the office starts with.
--
-- Seeded, not shipped: every row here is editable at /ops/checklists from the
-- moment it lands, and the office's edits survive this file being re-run
-- (every insert is `on conflict do nothing`).
--
-- The two booking lists are generated from `app/lib/task-template.ts`, which
-- is Raman's ops spec as data, so the seed and the spec cannot drift. The
-- guide and offering lists are new: guide verification had one flat list of
-- check types for every guide alike, and putting an experience live had no
-- list at all.

insert into checklists (scope, key, name, description, applies_to, is_default)
values ('booking', 'booking_trek', 'Running a trek', 'The thirty things a multi-day trek needs, from the enquiry to the journal, timed from departure.', array['trek']::text[], true)
on conflict (key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'quote', 'Answer the enquiry and send a quote', 'Inquiry', 'office', 'Quote sent', 'none', null, 0
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'deposit', 'Deposit charged and recorded', 'Booked', 'system', 'Payment ID stored', 'created', 0, 1
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'guide_accept', 'Guide accepts the trip', 'Booked', 'guide', 'Accepted in the app', 'created', 1, 2
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'contract', 'Guide contract signed', 'Booked', 'office', 'Both signatures', 'created', 7, 3
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'passport', 'Passports uploaded and verified', 'Documents', 'client', 'Verified, 6+ months valid', 'start', -120, 4
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'insurance', 'Insurance verified', 'Documents', 'client', 'Altitude, helicopter and dates all covered', 'start', -120, 5
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'health', 'Altitude health questions answered', 'Documents', 'client', 'Submitted, flags reviewed', 'start', -90, 6
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'emergency_call', 'Emergency contact confirmed by phone', 'Documents', 'office', 'Call logged', 'start', -60, 7
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'waiver', 'Waiver signed', 'Documents', 'client', 'Signed', 'start', -60, 8
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'flights', 'Domestic flights booked both ways', 'Logistics', 'office', 'Ticket numbers stored', 'start', -75, 9
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'porter', 'Porter assigned, insured and accepted', 'Logistics', 'office', 'Porter named', 'start', -60, 10
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'hotel', 'Kathmandu hotel booked', 'Logistics', 'office', 'Confirmation stored', 'start', -45, 11
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'permits', 'Permits bought for the route', 'Logistics', 'office', 'Permit numbers stored', 'start', -30, 12
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'pickup', 'Airport pickup scheduled', 'Logistics', 'office', 'Driver named', 'start', -30, 13
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'balance', 'Balance charged', 'Final prep', 'system', 'Paid in full', 'start', -14, 14
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'briefing', 'Briefing pack sent to the trekker', 'Final prep', 'system', 'Opened', 'start', -7, 15
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'reconfirm_flights', 'Flights reconfirmed', 'Final prep', 'office', 'Reconfirmed', 'start', -3, 16
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'trip_sheet', 'Trip sheet sent to the guide', 'Final prep', 'system', 'Opened by the guide', 'start', -2, 17
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'advance', 'Cash advance handed to the guide', 'Final prep', 'office', 'Amount logged', 'start', -1, 18
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'arrival', 'Picked up, hotel, briefing, gear check', 'Arrival', 'office', 'All four tapped', 'start', 0, 19
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'handover', 'Guide handover', 'Arrival', 'office', 'Tapped', 'start', 0, 20
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'checkin', 'Evening check-in every day', 'On trail', 'guide', 'Check-in by 8pm', 'none', null, 21
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'deviation', 'Any deviation logged', 'On trail', 'guide', 'Logged', 'none', null, 22
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'return_flight', 'Return flight flown', 'Return', 'guide', 'Tapped', 'none', null, 23
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'dropoff', 'Drop-off done', 'Return', 'office', 'Tapped', 'none', null, 24
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'receipts', 'Teahouse receipts submitted', 'Settle', 'guide', 'Uploaded', 'start', 3, 25
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'reconcile', 'Advance reconciled', 'Settle', 'office', 'Balanced', 'start', 5, 26
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'payout', 'Guide and porter paid, Fund moved', 'Settle', 'office', 'Payout IDs stored', 'start', 7, 27
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'review', 'Review requested', 'Close', 'system', 'Sent', 'start', 2, 28
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'journal', 'Trek journal published, incidents closed', 'Close', 'office', 'Trip locked', 'start', 14, 29
  from checklists where key = 'booking_trek'
on conflict (checklist_id, key) do nothing;

insert into checklists (scope, key, name, description, applies_to, is_default)
values ('booking', 'booking_day', 'Running a day experience', 'A day experience, timed from the slot. Most of it happens the evening before.', array['day_hike', 'food_culture', 'adventure', 'city']::text[], false)
on conflict (key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'booking', 'Payment, waiver and pickup point', 'Booking', 'client', 'All three done', 'created', 0, 0
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'minimum', 'Decide the slot if it is below minimum (6pm)', 'Slot check', 'office', 'Run, merge or cancel', 'start', -1, 1
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'assign', 'Guide and vehicle assigned (6pm)', 'Slot check', 'office', 'Both named', 'start', -1, 2
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'confirmations', 'Pickup details sent to every guest (7pm)', 'Confirm', 'system', 'Sent', 'start', -1, 3
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'ack', 'Guide and driver acknowledge the run sheet (8pm)', 'Confirm', 'guide', 'Acknowledged', 'start', -1, 4
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'chase', 'Call the guests who did not reply (9pm)', 'Confirm', 'office', 'Call logged', 'start', -1, 5
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'weather', 'Weather check — go or cancel (1h before)', 'Morning', 'office', 'Decision logged', 'start', 0, 6
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'pickups', 'Every pickup tapped, no-shows marked', 'Morning', 'guide', 'All tapped', 'start', 0, 7
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'started', 'Started', 'Live', 'guide', 'Tapped', 'start', 0, 8
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'finished', 'Finished and dropped off', 'Live', 'guide', 'Tapped', 'start', 0, 9
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'headcount', 'Final headcount and expenses', 'Close', 'guide', 'Submitted', 'start', 0, 10
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'review', 'Review request sent', 'Close', 'system', 'Sent', 'start', 0, 11
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position)
select id, 'payout', 'Guide, driver and host paid', 'Settle', 'office', 'Paid', 'start', 7, 12
  from checklists where key = 'booking_day'
on conflict (checklist_id, key) do nothing;

-- ── guide verification ──────────────────────────────────────────────────
--
-- Three lists rather than one. Every guide gets the core papers; a guide
-- walking to 5,364m is asked for altitude training, their own helicopter
-- cover and a reference somebody actually rang, and a host running a momo
-- crawl in Thamel is asked for the languages on their profile and the local
-- knowledge to back them.
--
-- Nothing in the data says which kind of guide somebody is — `guides` has a
-- tier and a list of regions and no type — so `applies_to` here is a label
-- for the office to sort by and ops picks the list. When guides carry a type,
-- this becomes the automatic match and nothing else changes.

insert into checklists (scope, key, name, description, applies_to, is_default)
values ('guide', 'guide_core', 'Guide — core papers', 'What every guide, host and driver is asked for, whatever they run.', array['any']::text[], true)
on conflict (key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'licence', 'Trekking licence seen and the number recorded', 'Papers', 'office', 'Licence number and expiry on file', 'created', 7, 0, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'id_match', 'Government ID matches the name on the licence', 'Papers', 'office', 'Both seen, names agree', 'created', 7, 1, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'phone', 'Phone verified by calling it', 'Papers', 'office', 'Answered by the guide themselves', 'created', 3, 2, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'pan_card', 'PAN card', 'Papers', 'office', 'Number on file', 'created', 14, 3, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'payout_account', 'Payout account proof', 'Money', 'office', 'Bank or wallet name matches the guide''s own name', 'created', 14, 4, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'police_cert', 'Police clearance', 'Papers', 'office', 'Certificate under a year old', 'created', 30, 5, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'photo', 'Profile photo and a hook line a person would read', 'Profile', 'guide', 'Both on the profile', 'created', 7, 6, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'intro_call', 'Introduction call — how they talk to a nervous trekker', 'Interview', 'office', 'Call logged with a note', 'created', 14, 7, true
  from checklists where key = 'guide_core'
on conflict (checklist_id, key) do nothing;

insert into checklists (scope, key, name, description, applies_to, is_default)
values ('guide', 'guide_trek', 'Guide — trekking guide', 'The core papers plus what somebody responsible for a party above 4,000m has to show.', array['trek guide']::text[], false)
on conflict (key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'licence', 'Trekking licence seen and the number recorded', 'Papers', 'office', 'Licence number and expiry on file', 'created', 7, 0, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'id_match', 'Government ID matches the name on the licence', 'Papers', 'office', 'Both seen, names agree', 'created', 7, 1, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'phone', 'Phone verified by calling it', 'Papers', 'office', 'Answered by the guide themselves', 'created', 3, 2, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'pan_card', 'PAN card', 'Papers', 'office', 'Number on file', 'created', 14, 3, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'payout_account', 'Payout account proof', 'Money', 'office', 'Bank or wallet name matches the guide''s own name', 'created', 14, 4, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'police_cert', 'Police clearance', 'Papers', 'office', 'Certificate under a year old', 'created', 30, 5, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'photo', 'Profile photo and a hook line a person would read', 'Profile', 'guide', 'Both on the profile', 'created', 7, 6, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'intro_call', 'Introduction call — how they talk to a nervous trekker', 'Interview', 'office', 'Call logged with a note', 'created', 14, 7, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'first_aid', 'Wilderness first-aid certificate, in date', 'Safety', 'office', 'Certificate seen, expiry recorded', 'created', 14, 8, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'altitude_training', 'Altitude and acute-mountain-sickness training', 'Safety', 'office', 'Certificate or a named course', 'created', 14, 9, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'insurance', 'Their own insurance, including helicopter evacuation', 'Safety', 'office', 'Policy number and dates on file', 'created', 14, 10, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'altitude_experience', 'Altitude experience — where they have actually walked', 'Interview', 'office', 'Routes and dates, checked against one reference', 'created', 21, 11, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'reference', 'One reference from an agency or a past client', 'Interview', 'office', 'Spoken to, not just emailed', 'created', 21, 12, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'porter_rules', 'Porter welfare rules read and agreed', 'Safety', 'guide', 'Signed', 'created', 21, 13, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'radio', 'Knows the evening check-in, by app and by SMS', 'Safety', 'office', 'Sent one test check-in', 'created', 30, 14, true
  from checklists where key = 'guide_trek'
on conflict (checklist_id, key) do nothing;

insert into checklists (scope, key, name, description, applies_to, is_default)
values ('guide', 'guide_day', 'Guide — day guide or host', 'The core papers plus what somebody running a day out for strangers has to show.', array['day guide', 'food host', 'driver']::text[], false)
on conflict (key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'licence', 'Trekking licence seen and the number recorded', 'Papers', 'office', 'Licence number and expiry on file', 'created', 7, 0, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'id_match', 'Government ID matches the name on the licence', 'Papers', 'office', 'Both seen, names agree', 'created', 7, 1, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'phone', 'Phone verified by calling it', 'Papers', 'office', 'Answered by the guide themselves', 'created', 3, 2, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'pan_card', 'PAN card', 'Papers', 'office', 'Number on file', 'created', 14, 3, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'payout_account', 'Payout account proof', 'Money', 'office', 'Bank or wallet name matches the guide''s own name', 'created', 14, 4, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'police_cert', 'Police clearance', 'Papers', 'office', 'Certificate under a year old', 'created', 30, 5, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'photo', 'Profile photo and a hook line a person would read', 'Profile', 'guide', 'Both on the profile', 'created', 7, 6, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'intro_call', 'Introduction call — how they talk to a nervous trekker', 'Interview', 'office', 'Call logged with a note', 'created', 14, 7, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'first_aid', 'Basic first aid, in date', 'Safety', 'office', 'Certificate seen, expiry recorded', 'created', 14, 8, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'languages', 'Languages checked by speaking them', 'Interview', 'office', 'Each language on the profile heard', 'created', 14, 9, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'local_knowledge', 'Local knowledge for the area they will run', 'Interview', 'office', 'Walked the route with them, or a strong reference', 'created', 21, 10, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'guest_handling', 'Handling a group of strangers — pace, no-shows, latecomers', 'Interview', 'office', 'Talked through, noted', 'created', 21, 11, true
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'vehicle', 'Driving licence and vehicle papers, if they drive', 'Papers', 'office', 'Seen, or marked not needed', 'created', 21, 12, false
  from checklists where key = 'guide_day'
on conflict (checklist_id, key) do nothing;

-- ── putting an experience live ──────────────────────────────────────────
--
-- There was no list for this at all: an experience went live when somebody
-- pressed publish, and whether it had photographs, a meeting point a person
-- could stand in, or a price that added up was a matter of who looked.

insert into checklists (scope, key, name, description, applies_to, is_default)
values ('offering', 'offering_publish', 'Putting an experience live', 'Everything checked before an experience is visible to a trekker in Berlin.', array['trek', 'day_hike', 'food_culture', 'adventure', 'city']::text[], true)
on conflict (key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'title', 'Title says what it is, not what it feels like', 'Words', 'office', 'Reads as a plain description', 'none', null, 0, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'summary', 'Summary a stranger can understand in one read', 'Words', 'guide', 'Written, checked by the office', 'none', null, 1, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'photos', 'Photographs — the guide''s own, not stock', 'Photos', 'guide', 'A cover and at least three more', 'none', null, 2, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'price', 'Price checked against the breakdown and the day rate', 'Money', 'office', 'Every line adds up', 'none', null, 3, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'included', 'What is included and what is not', 'Words', 'guide', 'Both lists filled in', 'none', null, 4, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'meeting_point', 'Meeting point and time, exactly', 'Logistics', 'guide', 'A place somebody could stand in', 'none', null, 5, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'capacity', 'Minimum and maximum party size', 'Logistics', 'office', 'Both set and sensible', 'none', null, 6, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'itinerary', 'Day by day, or hour by hour', 'Words', 'guide', 'Every day or hour accounted for', 'none', null, 7, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'route', 'Route linked, where there is one', 'Logistics', 'office', 'Linked, or marked not needed', 'none', null, 8, false
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'permits', 'Permits listed on the route, with today''s prices', 'Logistics', 'office', 'Checked against the counter', 'none', null, 9, false
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'accessibility', 'Activity level and accessibility answered honestly', 'Words', 'guide', 'Both answered', 'none', null, 10, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'cancellation', 'Cancellation terms match the policy', 'Money', 'office', 'Checked', 'none', null, 11, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'test_booking', 'Book it end to end as a trekker would', 'Before live', 'office', 'Reached the payment page without a dead end', 'none', null, 12, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
insert into checklist_items (checklist_id, key, label, stage, owner, done_when, anchor, offset_days, position, required)
select id, 'seo', 'Page has its own title, description and photograph for sharing', 'Before live', 'office', 'Checked with the link preview', 'none', null, 13, true
  from checklists where key = 'offering_publish'
on conflict (checklist_id, key) do nothing;
