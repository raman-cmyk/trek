-- 0008 — Indexes (minimum set, docs/03).

create index offerings_kind_status_idx on offerings (kind, status);
create index offerings_live_guide_idx on offerings (guide_id) where status = 'live';
create index enquiries_guide_status_idx on enquiries (guide_id, status);
create index enquiries_open_expiry_idx on enquiries (expires_at) where status = 'open';
create index bookings_guide_status_idx on bookings (guide_id, status);
create index bookings_trekker_status_idx on bookings (trekker_id, status);
create index bookings_status_start_idx on bookings (status, start_date);
create index availability_guide_day_idx on availability (guide_id, day);
create index checkins_booking_day_idx on checkins (booking_id, day);
create index reviews_published_subject_idx on reviews (subject_id) where published_at is not null;
create index payouts_status_idx on payouts (status);
create index messages_flagged_idx on messages (flagged_reason) where flagged_reason is not null;
