-- 0064 — A trekker may take a request back.
--
-- Requests became visible to the person who sent them (they were only ever on
-- the guide's screen), and the first thing anybody wants from a list of things
-- they sent is a way to unsend one: dates change, plans change, and a request
-- nobody can cancel is one a guide answers for nothing.
--
-- 'declined' would have done the job and lied about who did it. Ops reads
-- these statuses when a guide's response rate looks bad, and a trekker
-- changing their mind must not count against the guide.

alter table enquiries drop constraint if exists enquiries_status_check;
alter table enquiries add constraint enquiries_status_check
  check (status in ('open','quoted','accepted','declined','withdrawn','expired','converted'));
