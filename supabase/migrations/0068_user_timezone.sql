-- 0068 — What time it is where the other person is.
--
-- A trekker in Denver writes at 2pm and it is 1:45am in Solukhumbu. The guide
-- is asleep; the trekker sees no reply for eleven hours and reads it as being
-- turned down, and books elsewhere. Nothing was wrong except that neither of
-- them could see the other's clock.
--
-- Nepal's side needs no column — it is UTC+05:45 all year, so the guide's
-- local time is arithmetic. The trekker's side does, because "US" is four
-- time zones. The browser knows its own zone; the composer sends it with the
-- first message and it is kept here.

alter table users add column timezone text;

comment on column users.timezone is
  'IANA zone from the sender''s browser (0068), so the other side can see their clock.';
