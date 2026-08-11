-- ============ JOURNAL ALBUMS ============
-- A journal is a photo album, not a blog post: every day of the trek gets an
-- entry (one line and a photo is a fine entry) and every journal carries
-- 12-15 photographs. Short days matter — they are what makes the dramatic
-- ones land.
--
-- Replaces the sparse entries from seed_journals.sql. Runs after it.

delete from public.journal_entries where journal_id in (select id from public.journals where slug in ('manaslu-2025-10','langtang-2025-04','gokyo-2025-11','ebc-anon-2025-10'));
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 1, 'Drive to Machha Khola, and it rained', 'Eight hours in a jeep on a road that is mostly river. Everyone quiet by the end. Jef asked how many days like this and I said only today.', 930, false, 'full', '[{"url":"/img/journal/rain.jpg","alt":"rain","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 2, 'The long bridge before Jagat', 'Jef stopped in the middle. The river is very loud there and the bridge moves when you walk, this is normal but nobody believes me. We stood maybe ten minutes. I did not touch him, I only talked about the fish in the river which is a stupid thing to talk about but it worked.', 1340, false, 'full', '[{"url":"/img/journal/bridge.jpg","alt":"bridge","people":true}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 3, 'Permit check at Jagat, then Deng', 'The police write your name in a book by hand. After Jagat the houses change - flat roofs, stacked wood, mani walls. Simon noticed before I said anything.', 1860, false, 'two', '[{"url":"/img/journal/village.jpg","alt":"village","people":false},{"url":"/img/journal/mani.jpg","alt":"mani","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 4, 'Namrung, and the first cold morning', 'Frost on the grass. We ate too much because the lodge had good bread. This is the last day the valley feels green.', 2630, false, 'two', '[{"url":"/img/journal/dalbhat.jpg","alt":"dalbhat","people":false},{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 5, 'Yaks coming down as we went up', 'All morning the yak trains came down from Samagaon carrying nothing, which means they were going for a load. Simon counted forty-one animals. We stood off the trail every time - on the mountain side, never the drop side. This is the first thing I teach.', 3180, false, 'portrait', '[{"url":"/img/journal/yaks.jpg","alt":"yaks","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 6, 'Lho, and Manaslu shows itself', 'Late afternoon the cloud tore and the whole mountain was there. Nobody spoke. Then Jef said a word in Flemish that I will not write down.', 3180, false, 'full', '[{"url":"/img/journal/pano.jpg","alt":"pano","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 7, 'Samagaon, rest day', 'Walked up to Birendra Lake in the morning and did nothing in the afternoon. Rest days are not lazy, they are the work.', 3530, false, 'full', '[{"url":"/img/journal/lake.jpg","alt":"lake","people":false},{"url":"/img/journal/village.jpg","alt":"village","people":false},{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 8, 'Samdo, close to Tibet', 'Short day on purpose. You can see the old trading pass from the village. Wind all afternoon.', 3860, false, 'full', '[{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 9, 'We did not cross', 'Snow came in the night and in the morning the pass was not safe. We went back down to the lodge and waited. Jef was upset, I think he thought I decided this because of him. I told him the pass will be there next year and so will he. We played cards. It was a long day.', 4460, true, 'two', '[{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":true},{"url":"/img/journal/rain.jpg","alt":"rain","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 10, 'Larkya La, 5,106 m', 'We left at four. Cold but no wind, and the snow from two days before was hard and good to walk on. Jef went in front for the last hour and I let him. At the top he did not say anything for a while.', 5106, false, 'full', '[{"url":"/img/journal/pass.jpg","alt":"pass","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 11, 'Down to Bimthang, and trees', 'Two thousand metres down in one day. Knees. But at the bottom there are pine trees and the air is thick and everyone is talking again.', 3590, false, 'two', '[{"url":"/img/journal/village.jpg","alt":"village","people":false},{"url":"/img/journal/pano.jpg","alt":"pano","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 12, 'Dharapani, and boots off', 'We joined the Annapurna trail and it felt crowded after two weeks of nobody. Dried everything by the stove.', 1860, false, 'full', '[{"url":"/img/journal/boots.jpg","alt":"boots","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 13, 'Jeep to Besisahar', 'Long dusty road. Simon slept the whole way. Jef did not - he watched out of the window the entire time.', 760, false, 'full', '[{"url":"/img/journal/rain.jpg","alt":"rain","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 14, 'Kathmandu', 'Dal bhat at the same place I always take people. They both ordered a second plate.', 1400, false, 'full', '[{"url":"/img/journal/dalbhat.jpg","alt":"dalbhat","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 15, 'Last morning', 'Airport. Jef shook my hand for too long. That is the whole job.', 1400, false, 'full', '[{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'manaslu-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 1, 'Drive to Syabrubesi', 'Seven hours and the road is bad in three places. Marie did not complain once, which I noticed.', 1460, false, 'full', '[{"url":"/img/journal/rain.jpg","alt":"rain","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 2, 'Up the gorge to Lama Hotel', 'Bamboo, monkeys, the river very loud. Steep the whole day but in the shade.', 2470, false, 'two', '[{"url":"/img/journal/bridge.jpg","alt":"bridge","people":false},{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 3, 'Rain all day to Ghodatabela', 'It rained from the morning. Marie had good boots but no gaiters and the trail was a river in some places. We stopped early. The lodge had a stove and we dried everything, and the owner is my cousin so we ate well.', 3000, true, 'full', '[{"url":"/img/journal/rain.jpg","alt":"rain","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 4, 'Into the valley, and the memorial', 'The valley opens here. There is a wall with the names. I stopped and she stopped without me asking.', 3430, false, 'portrait', '[{"url":"/img/journal/mani.jpg","alt":"mani","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 5, 'Where the village was', 'I showed her the stone. There is a big rock now where the old village was and you can walk over it without knowing. I told her who lived there. She did not take a photograph and I was glad about that.', 3430, false, 'full', '[{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 6, 'Kyanjin Gompa, cheese and yaks', 'Short walk. The cheese factory is real and the cheese is good. Afternoon lying in the sun watching yaks.', 3870, false, 'full', '[{"url":"/img/journal/yaks.jpg","alt":"yaks","people":false},{"url":"/img/journal/dalbhat.jpg","alt":"dalbhat","people":false},{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 7, 'Kyanjin Ri before breakfast', 'Clear finally. We went up slow, two hours, and the whole Langtang Lirung was out. Marie sat down for twenty minutes and did not talk. Then we went down and ate everything in the lodge.', 4773, false, 'full', '[{"url":"/img/journal/pano.jpg","alt":"pano","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 8, 'Down and out', 'Two long days made into one because she wanted to. Fifteen hundred metres down. We caught the last bus.', 1460, false, 'full', '[{"url":"/img/journal/boots.jpg","alt":"boots","people":false}]'::jsonb
from public.journals where slug = 'langtang-2025-04'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 1, 'Lukla, and the flight everyone talks about', 'Landed at seven. Tom filmed the whole approach. Ana had her eyes shut. Wei said nothing, which I learned is normal for Wei.', 2610, false, 'full', '[{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 2, 'The hill to Namche', 'Six hundred metres in the afternoon heat. Tom went ahead twice and I brought him back twice.', 3440, false, 'two', '[{"url":"/img/journal/bridge.jpg","alt":"bridge","people":false},{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 3, 'Namche, acclimatisation', 'Up to Khumjung and back, and the bakery. This is where a group either becomes a group or does not.', 3440, false, 'full', '[{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 4, 'Leaving the Base Camp trail', 'At the junction almost everyone went right. We went left and within an hour there was nobody.', 4040, false, 'full', '[{"url":"/img/journal/mani.jpg","alt":"mani","people":false},{"url":"/img/journal/village.jpg","alt":"village","people":false},{"url":"/img/journal/pano.jpg","alt":"pano","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 5, 'Acclimatisation day at Machhermo', 'We walked up two hundred metres and came back down, which everyone hates and everyone needs. Wei slept in the afternoon. Tom wanted to keep going to Gokyo and I said no. This is the day that makes the rest work.', 4470, false, 'two', '[{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":false},{"url":"/img/journal/mani.jpg","alt":"mani","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 6, 'First and second lakes', 'The colour starts. Ana stopped at both and we lost forty minutes and it did not matter.', 4790, false, 'portrait', '[{"url":"/img/journal/lake.jpg","alt":"lake","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 7, 'The third lake', 'Ana photographed the lake for one hour. It is very blue, more blue than photographs show, and the moraine wall above it is the biggest pile of rock I know. Minus fourteen that night in the lodge.', 4790, false, 'full', '[{"url":"/img/journal/lake.jpg","alt":"lake","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 8, 'Gokyo Ri at four in the morning', 'Everyone was angry with me at four. Head torches, two hours up, very cold hands. Then the sun came on Everest and Lhotse and Makalu at the same time and nobody was angry any more.', 5357, false, 'full', '[{"url":"/img/journal/dawn.jpg","alt":"dawn","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 9, 'Rest, or the fifth lake', 'Tom and I went to the fifth lake. Ana and Wei stayed and slept. Both were right.', 4790, false, 'two', '[{"url":"/img/journal/lake.jpg","alt":"lake","people":false},{"url":"/img/journal/pano.jpg","alt":"pano","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 10, 'Down to Dole', 'Losing height quickly. Wei started talking on this day and did not stop for two days.', 4040, false, 'full', '[{"url":"/img/journal/yaks.jpg","alt":"yaks","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 11, 'Namche, and a shower', 'The first hot water in eleven days. Also the first beer, which I allow at Namche and not before.', 3440, false, 'two', '[{"url":"/img/journal/dalbhat.jpg","alt":"dalbhat","people":false},{"url":"/img/journal/boots.jpg","alt":"boots","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 12, 'Lukla', 'Long day down. The flight went on time, which happens perhaps half of the time.', 2860, false, 'full', '[{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'gokyo-2025-11'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 1, 'Lukla to Phakding', 'Short first day on purpose. Everyone arrives thinking they are stronger than they are.', 2610, false, 'full', '[{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 2, 'The Namche hill', 'The two children went in front, the parents behind. I walked with the mother.', 3440, false, 'two', '[{"url":"/img/journal/bridge.jpg","alt":"bridge","people":true},{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 3, 'Acclimatisation at Namche', 'Everest View Hotel in the morning. First time the whole family saw the mountain together.', 3440, false, 'full', '[{"url":"/img/journal/pano.jpg","alt":"pano","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 4, 'Tengboche', 'The monastery, and the monks at four in the afternoon. The younger boy asked good questions.', 3860, false, 'full', '[{"url":"/img/journal/mani.jpg","alt":"mani","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 5, 'Dingboche', 'Above the trees now. Cold wind all afternoon.', 4410, false, 'two', '[{"url":"/img/journal/village.jpg","alt":"village","people":false},{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 6, 'Dingboche, and a conversation', 'The mother said she would stop here. I did not argue in front of the children. In the evening we talked and I said going slower is not stopping. She agreed to try two more days at her own speed and we would decide again at Lobuche.', 4410, true, 'full', '[{"url":"/img/journal/teahouse.jpg","alt":"teahouse","people":true}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 7, 'Slowly to Lobuche', 'We took six hours for a four-hour walk. She was fine. The memorials at Thukla quieted everyone.', 4940, false, 'portrait', '[{"url":"/img/journal/mani.jpg","alt":"mani","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 8, 'Gorak Shep', 'Two hours on the glacier moraine, which is the worst walking on the trek and nobody warns you.', 5164, false, 'full', '[{"url":"/img/journal/pass.jpg","alt":"pass","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 9, 'Base Camp', 'She arrived last and she arrived fine. The others had been there twenty minutes taking photographs. I have seen this many times - the person who is most afraid at the start is usually the strongest at the end, because they went at the speed the mountain asked for.', 5364, false, 'two', '[{"url":"/img/journal/pass.jpg","alt":"pass","people":false},{"url":"/img/journal/bridge.jpg","alt":"bridge","people":true}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 10, 'Kala Patthar, dark and cold', 'Minus eighteen with the wind. Two of the four came up. That is a good ratio.', 5644, false, 'full', '[{"url":"/img/journal/dawn.jpg","alt":"dawn","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 11, 'Down to Pheriche', 'Losing height and everyone getting louder by the hour.', 4270, false, 'full', '[{"url":"/img/journal/yaks.jpg","alt":"yaks","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 12, 'Namche', 'Bakery, shower, and the boys bought hats they did not need.', 3440, false, 'two', '[{"url":"/img/journal/dalbhat.jpg","alt":"dalbhat","people":false},{"url":"/img/journal/boots.jpg","alt":"boots","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 13, 'Lukla', 'The last long day. The father thanked me three times on the way down.', 2860, false, 'full', '[{"url":"/img/journal/village.jpg","alt":"village","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;
insert into public.journal_entries (journal_id, day_no, title, body, altitude_m, is_hard_day, layout, photos)
select id, 14, 'Flight out', 'Weather held. Sometimes it does.', 1400, false, 'full', '[{"url":"/img/journal/rain.jpg","alt":"rain","people":false}]'::jsonb
from public.journals where slug = 'ebc-anon-2025-10'
on conflict (journal_id, day_no) do nothing;

-- Tags: route is already a column and required; these are the rest.
insert into public.journal_tags (journal_id, kind, value)
select id, 'season', 'Autumn' from public.journals where slug = 'manaslu-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'difficulty', 'Strenuous' from public.journals where slug = 'manaslu-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'group', 'Couple' from public.journals where slug = 'manaslu-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'conditions', 'Snow' from public.journals where slug = 'manaslu-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'theme', 'Turned back' from public.journals where slug = 'manaslu-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'season', 'Spring' from public.journals where slug = 'langtang-2025-04'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'difficulty', 'Moderate' from public.journals where slug = 'langtang-2025-04'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'group', 'Solo' from public.journals where slug = 'langtang-2025-04'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'conditions', 'Monsoon rain' from public.journals where slug = 'langtang-2025-04'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'theme', 'First-timer' from public.journals where slug = 'langtang-2025-04'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'season', 'Autumn' from public.journals where slug = 'gokyo-2025-11'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'difficulty', 'Hard' from public.journals where slug = 'gokyo-2025-11'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'group', 'Small group' from public.journals where slug = 'gokyo-2025-11'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'conditions', 'Clear' from public.journals where slug = 'gokyo-2025-11'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'theme', 'Photography' from public.journals where slug = 'gokyo-2025-11'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'season', 'Autumn' from public.journals where slug = 'ebc-anon-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'difficulty', 'Hard' from public.journals where slug = 'ebc-anon-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'group', 'Family' from public.journals where slug = 'ebc-anon-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'conditions', 'Windy' from public.journals where slug = 'ebc-anon-2025-10'
on conflict do nothing;
insert into public.journal_tags (journal_id, kind, value)
select id, 'theme', 'Altitude' from public.journals where slug = 'ebc-anon-2025-10'
on conflict do nothing;
