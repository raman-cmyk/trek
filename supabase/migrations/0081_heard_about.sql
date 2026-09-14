-- 0081 — "How did you hear about Guides of Nepal?"
--
-- Asked of every guide who applies. For a guide-first marketplace the answer
-- is the business: guides do not arrive from advertising, they arrive because
-- another guide told them, and knowing WHICH guide is the difference between
-- a channel you can grow and a number on a dashboard.
--
-- Two columns rather than one free-text box, so the channel can be counted
-- and the person can be named. The names are the valuable half.

alter table guides
  add column if not exists heard_about text,
  add column if not exists heard_about_detail text;

comment on column guides.heard_about is
  'Channel, from the fixed list in app/lib/heard-about.ts. Null for anyone who applied before the question existed — which is not the same as "somewhere else".';
comment on column guides.heard_about_detail is
  'Who, when the channel was a person: the guide or trekker who sent them.';

alter table guides drop constraint if exists guides_heard_about_detail_check;
alter table guides add constraint guides_heard_about_detail_check
  check (heard_about_detail is null or length(heard_about_detail) <= 120);

-- The question this column exists to answer — "where are guides coming from?"
-- — is a group-by over applicants, so it should not be a scan.
create index if not exists guides_heard_about_idx
  on guides (heard_about) where heard_about is not null;
