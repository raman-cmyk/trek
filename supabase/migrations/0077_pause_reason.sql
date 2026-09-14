-- 0077 — Why an experience was paused.
--
-- The founder's ask: "in the paused experience section there needs to be a
-- designated space where administrators can write down the specific reason
-- why an experience has been paused. This will help keep track of decisions
-- made regarding the availability of various experiences."
--
-- Until now Pause was one click and left nothing behind. A week later nobody
-- in the office could say whether a listing was off the market because the
-- photographs were somebody else's, because the guide was on a trek, or
-- because a price was wrong — and the guide, whose income it is, was told
-- nothing at all.
--
-- These three columns describe the CURRENT pause and are cleared when the
-- listing goes live again. The history is not lost: every pause and unpause
-- is written to offering_edits, which the guide already sees on their own
-- listing page and which nobody can edit.

alter table offerings
  add column if not exists paused_reason text,
  add column if not exists paused_at timestamptz,
  add column if not exists paused_by uuid references users(id);

comment on column offerings.paused_reason is
  'Why this listing is off the market, in the office''s own words. Cleared when it goes live again; the history lives in offering_edits.';

-- Reading a paused listing's reason is the office's business and the guide's.
-- No new policy is needed — these are columns on offerings, which is already
-- covered — but a paused listing must never leak its reason to a trekker, and
-- the public read policy on offerings is restricted to status = 'live', so it
-- cannot.

create index if not exists offerings_paused_idx
  on offerings (paused_at desc) where status = 'paused';
