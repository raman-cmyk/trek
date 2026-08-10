-- 0025 — Unread tracking for the messages inbox. One row per (user, thread);
-- thread_key is 'c:<conversation_id>' or 'b:<booking_id>'. Upserted whenever a
-- thread is opened; the inbox counts other-party messages newer than it.

create table thread_reads (
  user_id uuid not null references users(id) on delete cascade,
  thread_key text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread_key)
);
alter table thread_reads enable row level security;
create policy thread_reads_own on thread_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Demo/backfill: seed recaps for completed treks so /stories has content.
insert into recaps (booking_id, slug, photo_urls, stats)
select b.id,
       o.slug || '-' || substr(b.id::text, 1, 8),
       coalesce((select array_agg(url) from (
         select url from offering_photos where approved limit 6) x), '{}'),
       jsonb_build_object(
         'days', (b.end_date - b.start_date) + 1,
         'max_altitude_m', r.max_altitude_m)
from bookings b
join offerings o on o.id = b.offering_id
left join routes r on r.id = o.route_id
where b.status = 'completed' and o.kind = 'trek'
  and not exists (select 1 from recaps rc where rc.booking_id = b.id);

notify pgrst, 'reload schema';
