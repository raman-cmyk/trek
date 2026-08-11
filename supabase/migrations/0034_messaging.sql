-- 0034 — messaging: read receipts, presence, and canned replies.
--
-- Response speed is a ranked trust metric on this platform, so the thread has
-- to show it honestly: when a message was actually read, and whether the guide
-- is around right now. Both are cheap columns; neither is inferred.

-- ---- per-message read receipts ---------------------------------------------
-- thread_reads (0025) already tracks "has this thread been opened", which is
-- what the inbox badge needs. This is the other half: the sender wants to know
-- their specific message landed.
alter table messages add column if not exists read_at timestamptz;

create index if not exists messages_unread_idx
  on messages (booking_id, sender_id) where read_at is null;

-- ---- presence ---------------------------------------------------------------
-- Last seen, not "online" — a green dot that means "had a session token" is a
-- lie on a phone that has been in a pocket since Namche. We stamp it on real
-- page loads and render "active now" only inside a short window.
alter table users add column if not exists last_seen_at timestamptz;

create or replace function public.touch_last_seen(uid uuid)
  returns void language sql security definer set search_path = public as $$
  update users set last_seen_at = now()
  where id = uid and (last_seen_at is null or last_seen_at < now() - interval '2 minutes');
$$;

grant execute on function public.touch_last_seen(uuid) to authenticated, service_role;

-- ---- canned replies ---------------------------------------------------------
-- Most guides answer on a phone, on patchy signal, in their second or third
-- language. A tap that inserts a sentence they already wrote is worth more
-- than any amount of typing affordance.
create table if not exists canned_replies (
  id uuid primary key default gen_random_uuid(),
  guide_id uuid not null references guides(user_id) on delete cascade,
  label text not null,
  body text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists canned_replies_guide_idx on canned_replies (guide_id, sort);

alter table canned_replies enable row level security;

create policy canned_replies_owner on canned_replies for all
  using (guide_id = auth.uid() or public.is_ops())
  with check (guide_id = auth.uid() or public.is_ops());

-- Seed every verified guide a starter set matching the traveller-side prompts
-- on the empty thread, so the first reply is one tap even on day one. Guides
-- edit or delete these; they are a starting point, not house copy.
insert into canned_replies (guide_id, label, body, sort)
select g.user_id, v.label, v.body, v.sort
from guides g
cross join (values
  ('Fitness',
   'If you can walk 6-7 hours on a hill day, you are fit enough. We go slow and we stop when you need. Tell me about your last long walk and I will say honestly.', 1),
  ('My dates',
   'Send me the month you are thinking and I will tell you exactly which days I am free. My calendar on my profile is up to date.', 2),
  ('What is included',
   'Guide, teahouse lodging and all permits are included. Meals and your travel insurance are not. Every price on Trek shows the full breakdown - nothing is hidden.', 3),
  ('Altitude sickness',
   'We climb slow and I check you every evening. If you get sick we go down - this is not a failure, it is the plan. I carry a pulse oximeter and I have done this many times.', 4)
) as v(label, body, sort)
where g.status = 'verified'
  and not exists (select 1 from canned_replies c where c.guide_id = g.user_id);

notify pgrst, 'reload schema';
