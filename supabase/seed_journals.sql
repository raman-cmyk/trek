-- ============ DEMO TREK JOURNALS ============
-- Four journals so the wall, the index and the homepage strip have something
-- real-shaped to render. Same status as every other row in this seed file:
-- demo data, stripped before production (M9).
--
-- They are attached to seeded completed bookings, which is the same rule the
-- real thing enforces — journals_real_trip means a journal cannot exist
-- without a trek behind it, and that constraint is not relaxed for the demo.
--
-- The voices are deliberately uneven. Sonam writes in short flat sentences,
-- Pemba explains too much, Sunita is blunt. If these ever read like one
-- copywriter wrote all four, the whole feature has failed.
--
-- Runs after seed.sql and the cohort (see sql_paths in config.toml).

create table if not exists _seed_journals (
  key text primary key, guide_slug text, route_slug text, title text,
  start_date date, end_date date, group_label text, group_anon text,
  max_altitude_m int, distance_km numeric, pass_crossed text, weather_note text,
  cover text, guide_note text, client_note text, client_note_author text,
  names_ok boolean, photos_ok boolean
);
truncate _seed_journals;

insert into _seed_journals values
('manaslu', 'binod-tamang', 'manaslu-circuit',
 'Manaslu in late October, with two brothers from Belgium',
 '2025-10-12', '2025-10-26', 'Jef & Simon, BE', 'two brothers from Belgium',
 5106, 177.0, 'Larkya La',
 'Snow on the pass on day 9. We waited one day at Samagaon.',
 '/img/journal/pass.jpg',
 'Jef was scared on the bridge on day two. He stood there long time and Simon did not laugh at him, which I remember. By day ten he crossed first, not looking down. This is why I do this work. Not the pass. The bridge.',
 'Binod told us on day one that we might not cross. He was right to say it early. When we did cross it felt like ours, not something we bought.',
 'Jef, BE', true, true),

('langtang', 'nima-tamang', 'langtang-valley',
 'Langtang in April, and the rhododendrons were early',
 '2025-04-06', '2025-04-13', 'Marie, FR', 'a guest from France',
 4984, 62.0, null,
 'Rain from day 3 to day 5. Clear on Kyanjin Ri.',
 '/img/journal/rain.jpg',
 'This is my valley. I do not show the new lodges first, I show where the old village was. Marie asked me nothing for a long time and then asked everything. That is the right way round I think.',
 null, null, true, true),

('gokyo', 'lakpa-sherpa', 'gokyo-lakes',
 'Gokyo with a group who all wanted different things',
 '2025-11-02', '2025-11-13', 'Tom, Ana & Wei, AU/ES/SG', 'three guests', 5357,
 92.0, 'Gokyo Ri',
 'Cold and completely clear the whole way. Minus 14 at the lakes.',
 '/img/journal/lake.jpg',
 'Tom wanted to go fast, Ana wanted to photograph everything, Wei was quiet and just wanted to arrive. Eleven days is enough time for a group to become one speed. By Machhermo they were waiting for each other without me saying it.',
 'Lakpa woke us at four and it was minus fourteen and I was furious with him. Then the sun came onto Everest. I have never seen anything like it and I never said sorry properly, so: sorry Lakpa.',
 'Ana, ES', true, true),

('ebc-anon', 'pemba-sherpa', 'everest-base-camp',
 'Base Camp in the last week of October',
 '2025-10-19', '2025-11-01', null, 'a family of four',
 5644, 130.0, null,
 'Wind at Lobuche for two days. Otherwise good.',
 '/img/journal/dawn.jpg',
 'The mother of this family did not want to go above Dingboche. We talked in the evening and I said it is fine, this is not a failure, and she went to Base Camp two days later at her own speed and she was the strongest of them at the end. I have seen this many times.',
 null, null, false, false);

-- Journals hang off real completed bookings. Where a seeded guide has one we
-- use it; otherwise the journal is marked pre_platform, which is exactly the
-- path ops uses for a trek a guide led before joining.
insert into public.journals (
  slug, guide_id, route_id, booking_id, pre_platform, pre_platform_note,
  title, start_date, end_date, group_label, group_anon,
  max_altitude_m, distance_km, pass_crossed, weather_note, cover_photo_url,
  guide_note, client_note, client_note_author,
  client_names_ok, client_photos_ok, status, published_at)
select
  s.key || '-' || to_char(s.start_date, 'YYYY-MM'),
  g.user_id,
  r.id,
  (select b.id from public.bookings b
    where b.guide_id = g.user_id and b.status = 'completed'
      and not exists (select 1 from public.journals j2 where j2.booking_id = b.id)
    order by b.start_date limit 1),
  (select count(*) from public.bookings b
    where b.guide_id = g.user_id and b.status = 'completed') = 0,
  'Demo seed — verified pre-platform trek',
  s.title, s.start_date, s.end_date, s.group_label, s.group_anon,
  s.max_altitude_m, s.distance_km, s.pass_crossed, s.weather_note, s.cover,
  s.guide_note, s.client_note, s.client_note_author,
  s.names_ok, s.photos_ok, 'published', s.end_date + interval '3 days'
from _seed_journals s
join public.guides g on g.slug = s.guide_slug
left join public.routes r on r.slug = s.route_slug
on conflict (slug) do nothing;

-- ---- day blocks -------------------------------------------------------------
-- Photo layouts alternate and the hard day is flagged, so the page has the
-- rhythm the template is built for rather than one grid repeated down it.
create table if not exists _seed_entries (
  jkey text, day_no int, title text, body text, altitude_m int,
  hard boolean, layout text, photos jsonb
);
truncate _seed_entries;

insert into _seed_entries values
('manaslu', 2, 'The long bridge before Jagat',
 'Jef stopped in the middle. The river is very loud there and the bridge moves when you walk, this is normal but nobody believes me. We stood maybe ten minutes. I did not touch him, I only talked about the fish in the river which is a stupid thing to talk about but it worked.',
 1340, false, 'full', '[{"url":"/img/journal/bridge.jpg","alt":"Suspension bridge above the Budhi Gandaki","people":true}]'),
('manaslu', 5, 'Yaks coming down as we went up',
 'All morning the yak trains came down from Samagaon carrying nothing, which means they were going for a load. Simon counted forty-one animals. We stood off the trail every time — on the mountain side, never the drop side. This is the first thing I teach.',
 3180, false, 'portrait', '[{"url":"/img/journal/yaks.jpg","alt":"Yak train on the Manaslu trail","people":false}]'),
('manaslu', 9, 'We did not cross',
 'Snow came in the night and in the morning the pass was not safe. We went back down to the lodge and waited. Jef was upset, I think he thought I decided this because of him. I told him the pass will be there next year and so will he. We played cards. It was a long day.',
 4460, true, 'two',
 '[{"url":"/img/journal/teahouse.jpg","alt":"Waiting out the weather in the lodge","people":true},{"url":"/img/journal/rain.jpg","alt":"Cloud sitting on the valley","people":false}]'),
('manaslu', 10, 'Larkya La, 5,106 m',
 'We left at four. Cold but no wind, and the snow from two days before was hard and good to walk on. Jef went in front for the last hour and I let him. At the top he did not say anything for a while.',
 5106, false, 'full', '[{"url":"/img/journal/pass.jpg","alt":"Prayer flags on Larkya La","people":false}]'),

('langtang', 3, 'Rain all day to Lama Hotel',
 'It rained from the morning. Marie had good boots but no gaiters and the trail was a river in some places. We stopped early. The lodge had a stove and we dried everything, and the owner is my cousin so we ate well.',
 2470, true, 'full', '[{"url":"/img/journal/rain.jpg","alt":"Wet trail below Lama Hotel","people":true}]'),
('langtang', 5, 'Where the village was',
 'I showed her the stone. There is a big rock now where the old village was and you can walk over it without knowing. I told her who lived there. She did not take a photograph and I was glad about that.',
 3430, false, 'portrait', '[{"url":"/img/journal/mani.jpg","alt":"Mani wall above the valley","people":false}]'),
('langtang', 7, 'Kyanjin Ri before breakfast',
 'Clear finally. We went up slow, two hours, and the whole Langtang Lirung was out. Marie sat down for twenty minutes and did not talk. Then we went down and ate everything in the lodge.',
 4773, false, 'full', '[{"url":"/img/journal/dawn.jpg","alt":"First light from Kyanjin Ri","people":false}]'),

('gokyo', 4, 'Acclimatisation day at Machhermo',
 'We walked up two hundred metres and came back down, which everyone hates and everyone needs. Wei slept in the afternoon. Tom wanted to keep going to Gokyo and I said no. This is the day that makes the rest work.',
 4470, false, 'two',
 '[{"url":"/img/journal/teahouse.jpg","alt":"Machhermo lodge in the afternoon","people":false},{"url":"/img/journal/mani.jpg","alt":"Mani stones above the village","people":false}]'),
('gokyo', 7, 'The third lake',
 'Ana photographed the lake for one hour. It is very blue, more blue than photographs show, and the moraine wall above it is the biggest pile of rock I know. Minus fourteen that night in the lodge.',
 4790, false, 'full', '[{"url":"/img/journal/lake.jpg","alt":"Third lake at Gokyo","people":false}]'),
('gokyo', 8, 'Gokyo Ri at four in the morning',
 'Everyone was angry with me at four. Head torches, two hours up, very cold hands. Then the sun came on Everest and Lhotse and Makalu at the same time and nobody was angry any more.',
 5357, false, 'full', '[{"url":"/img/journal/dawn.jpg","alt":"Sunrise from Gokyo Ri","people":false}]'),

('ebc-anon', 6, 'Dingboche, and a conversation',
 'The mother said she would stop here. I did not argue in front of the children. In the evening we talked and I said going slower is not stopping. She agreed to try two more days at her own speed and we would decide again at Lobuche.',
 4410, true, 'full', '[{"url":"/img/journal/teahouse.jpg","alt":"Evening in the Dingboche lodge","people":true}]'),
('ebc-anon', 9, 'Base Camp',
 'She arrived last and she arrived fine. The others had been there twenty minutes taking photographs. I have seen this many times — the person who is most afraid at the start is usually the strongest at the end, because they went at the speed the mountain asked for.',
 5364, false, 'two',
 '[{"url":"/img/journal/pass.jpg","alt":"Prayer flags at Base Camp","people":false},{"url":"/img/journal/bridge.jpg","alt":"Crossing below Namche on the way out","people":true}]');

insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select j.id, e.day_no, e.title, e.body, e.altitude_m, e.hard, e.layout, e.photos
from _seed_entries e
join _seed_journals s on s.key = e.jkey
join public.journals j on j.slug = s.key || '-' || to_char(s.start_date, 'YYYY-MM')
on conflict (journal_id, day_no) do nothing;

drop table _seed_entries;
drop table _seed_journals;

-- ---- porter-welfare consistency --------------------------------------------
-- The pledge used to be seeded by tier, which is why it appeared on some
-- profiles and not others for no reason a trekker could see. It is a
-- platform-wide commitment: every verified guide whose treks carry porters
-- signs it.
update public.guides g set porter_welfare = true
where g.status = 'verified'
  and exists (
    select 1 from public.offerings o
    where o.guide_id = g.user_id
      and coalesce((o.price_breakdown ->> 'porters_usd_cents')::int, 0) > 0
  );
