-- 0094 — the office can write up a check-in it took by phone.
--
-- `method` allowed 'app' and 'sms', which are the two ways a guide sends one
-- themselves. Above the treeline there is often neither: the word comes down
-- through a teahouse, a radio, or another party on their way back. The office
-- had no way to record that, so the safety log read "nothing yet" for a day
-- it had actually accounted for — and the welfare sweep kept escalating a
-- trek that was fine.
--
-- 'ops' is deliberately its own value rather than being written in as 'app'.
-- A day the guide sent and a day the office wrote down on their behalf are
-- different evidence, and for due diligence the log has to be able to say
-- which of the two it is holding.

alter table checkins drop constraint if exists checkins_method_check;
alter table checkins add constraint checkins_method_check
  check (method = any (array['app'::text, 'sms'::text, 'ops'::text]));
