-- ============ THE FOUNDING COHORT — 36 MORE GUIDES ============
-- The marketplace is not twelve people. This block takes the demo from 12 to
-- 48 verified guides across 20 districts, 13 of them women, each with a trek
-- of their own — enough supply that search, the date filter and the matcher
-- are exercised on something like real data rather than a handful of rows.
--
-- Portraits are at /public/img/guides/<slug>.jpg; the URL rewrite at the
-- bottom of seed.sql picks them up by slug, so nothing here hardcodes a path.
-- Everything downstream (price breakdowns, backup guides, verification
-- receipts, availability) is written generically over verified guides, so
-- these 36 are covered by those passes automatically.
--
-- Runs AFTER seed.sql (see sql_paths in config.toml), so the generic passes
-- seed.sql makes over "every verified guide" have already happened. The tail
-- of this file repeats the ones the cohort needs; every one of them is written
-- to be safely re-runnable, which is also what makes this file applicable
-- standalone against the cloud database.

create table if not exists _seed_cohort (
  n int, slug text, full_name text, email text, gender text, district text,
  tier int, years int, rate int, resp numeric, mins int, done int, payout text,
  hook text, bio text, langs text[],
  route text, days int, offer_slug text, title text, summary text
);
truncate _seed_cohort;

insert into _seed_cohort values
(13,'ang-dorje-sherpa','Ang Dorje Sherpa','angdorje@example.com','male','Solukhumbu',3,16,4700,0.97,38,44,'esewa',
 'Carried loads to Base Camp for nine years before he ever guided',
 'I started as a porter at nineteen, carrying kitchen gear to Base Camp. Nine seasons of that teaches you the trail in a way no course does — where the ice forms, which lodge has the warm room, how a person looks an hour before altitude sickness gets them. I have guided for seven years now and I still walk at porter pace.',
 array['Nepali','English','Sherpa','Tibetan'],'everest-base-camp',14,'ebc-porter-pace','Everest Base Camp at porter pace',
 'Fourteen days walked deliberately slowly by a guide who spent nine seasons carrying loads on this trail. Slow is not soft — slow is how you arrive.'),

(14,'chhiring-sherpa','Chhiring Sherpa','chhiring@example.com','male','Solukhumbu',2,8,3900,0.94,52,23,'bank',
 'Photographer first, guide second — he will wake you for the light',
 'I shoot for a living in the off season and I am incurable about it. If the clouds are doing something at 5am I will knock on your door. Most people forgive me by breakfast.',
 array['Nepali','English','Sherpa'],'gokyo-lakes',12,'gokyo-for-photographers','Gokyo Lakes for photographers',
 'Twelve days built around light, not kilometres. Longer stops at the lakes, an extra dawn on Gokyo Ri, and a guide who knows exactly where to stand.'),

(15,'nawang-sherpa','Nawang Sherpa','nawang@example.com','male','Solukhumbu',1,5,3200,0.90,85,11,'khalti',
 'Youngest licensed guide in Namche, and everyone there knows him',
 'I am from Namche and half the lodge owners between Lukla and Gorak Shep watched me grow up. That is worth more than it sounds when the trail is full and rooms are short.',
 array['Nepali','English','Sherpa'],'everest-base-camp',14,'ebc-namche-local','Everest Base Camp with a Namche local',
 'The classic route with a guide who was raised on it. Rooms when the lodges are full, and the version of Namche that is not on the main street.'),

(16,'pasang-lhamu-sherpa','Pasang Lhamu Sherpa','pasanglhamu@example.com','female','Solukhumbu',2,10,4100,0.96,40,26,'esewa',
 'Ten seasons in the Khumbu, and she has never lost a day to altitude',
 'I plan acclimatisation the way other people plan a wedding. It is not glamorous. It means an extra night in Dingboche when you feel fine and want to push on, and it is the reason my groups finish.',
 array['Nepali','English','Sherpa','Hindi'],'gokyo-lakes',13,'gokyo-slow-acclimatised','Gokyo Lakes, properly acclimatised',
 'Thirteen days instead of the usual twelve, with the extra night where it counts. Turquoise lakes, Gokyo Ri at dawn, and a headache-free arrival.'),

(17,'dolma-sherpa','Dolma Sherpa','dolma@example.com','female','Solukhumbu',2,12,4200,0.95,45,31,'bank',
 'Ran a teahouse for a decade before she started guiding',
 'I fed trekkers for ten years before I walked with them. I know which lodges cut corners with the water and which cook actually washes the vegetables. You will eat better with me, and you will get sick less.',
 array['Nepali','English','Sherpa'],'everest-base-camp',14,'ebc-eat-well','Everest Base Camp without the stomach trouble',
 'A guide who ran a Khumbu teahouse for ten years picking every lodge and every meal. The trail is the same; the fortnight is entirely different.'),

(18,'tenzing-bhote','Tenzing Bhote','tenzingb@example.com','male','Sankhuwasabha',1,9,3300,0.89,110,10,'khalti',
 'Grew up two days'' walk from the nearest road',
 'Where I am from, everything arrives on someone''s back. I am comfortable in places that are genuinely far from help, and I am honest with people about what that means before we go.',
 array['Nepali','English','Bhote','Hindi'],'manaslu-circuit',14,'manaslu-far-side','Manaslu Circuit, the far side',
 'The restricted circuit with a guide from a village two days from a road. Larkya La, fewer trekkers, and no pretending the remoteness is decorative.'),

(19,'kami-rita-tamang','Kami Rita Tamang','kamirita@example.com','male','Rasuwa',3,20,4400,0.98,32,58,'esewa',
 'Twenty years in Langtang, including the year it was buried',
 'I was guiding in the valley in April 2015 and I walked out of it. I do not tell that story unless someone asks. What I will say is that I read weather and slope differently now, and the people who walk with me benefit from that.',
 array['Nepali','English','Tamang','German'],'langtang-valley',9,'langtang-with-kami','Langtang Valley with twenty years of it',
 'Nine days in the valley with the guide who has walked it longest — through the yak pastures to Kyanjin Ri, and the rebuilt villages in between.'),

(20,'sanu-maya-tamang','Sanu Maya Tamang','sanumaya@example.com','female','Rasuwa',1,6,3100,0.92,70,13,'khalti',
 'Trained as a nurse, guides because the mountains pay better',
 'Two years in a district hospital in Dhunche, then I got my guide licence. I still carry a proper kit and I still know how to use it. Mostly it is blisters and stomachs, but not always.',
 array['Nepali','English','Tamang'],'langtang-valley',8,'langtang-nurse-led','Langtang Valley with a nurse on the team',
 'Eight days through Langtang led by a former district-hospital nurse. Same valley, considerably more competence when something goes wrong.'),

(21,'buddhi-tamang','Buddhi Tamang','buddhi@example.com','male','Nuwakot',2,13,3500,0.93,58,29,'bank',
 'Will make you stop for tea more often than you planned',
 'Thirteen years and I have not once regretted an unscheduled tea stop. Trekking in Nepal is half the walking and half the sitting down with people, and foreigners are usually in far too much of a hurry to notice.',
 array['Nepali','English','Tamang','Hindi'],'langtang-valley',9,'langtang-unhurried','Langtang Valley, unhurried',
 'Nine days with a guide who builds the tea stops into the itinerary. Kyanjin Ri is still there in the afternoon.'),

(22,'maya-gurung','Maya Gurung','mayag@example.com','female','Kaski',2,9,3700,0.96,44,25,'esewa',
 'Left an office in Kathmandu at thirty to guide full-time',
 'I did five years of accounts for a trekking agency and watched the guides come back looking like they had lived. At thirty I got my own licence. My mother has still not fully accepted it.',
 array['Nepali','English','Gurung','Japanese'],'annapurna-circuit',16,'annapurna-circuit-with-maya','Annapurna Circuit, the whole thing',
 'Sixteen days over Thorong La with a guide who chose this late and deliberately. Muktinath, Manang, and the long descent into Mustang.'),

(23,'prakash-gurung','Prakash Gurung','prakashg@example.com','male','Kaski',1,5,3000,0.91,65,14,'khalti',
 'Knows every side trail out of Pokhara, most of them unmarked',
 'I grew up walking these hills to school and back. There are paths above Dhampus that are not on any map and are better than the ones that are.',
 array['Nepali','English','Gurung'],'mardi-himal',5,'mardi-the-back-way','Mardi Himal the back way',
 'Five days onto the Mardi ridge by the trails the jeeps and the crowds do not use. Same viewpoint, a very different walk to it.'),

(24,'bishnu-gurung','Bishnu Gurung','bishnug@example.com','male','Lamjung',2,17,3800,0.94,50,36,'bank',
 'Watched the road eat the Annapurna Circuit and found the way around it',
 'When I started, the circuit was all footpath. Now there is a road most of the way and people say the trek is finished. It is not — but you need someone who knows the NATT trails that keep you off the jeep track. That is most of what I do.',
 array['Nepali','English','Gurung','Hindi'],'annapurna-circuit',16,'annapurna-off-the-road','Annapurna Circuit off the road',
 'Sixteen days using the old footpaths and the NATT variants wherever they exist. Dust and jeeps for as few hours as physically possible.'),

(25,'sarita-gurung','Sarita Gurung','saritag@example.com','female','Kaski',1,7,3300,0.93,55,17,'esewa',
 'Takes solo women trekkers more often than anyone else in Pokhara',
 'Most of my clients are women travelling alone. Some of them have been told by everyone at home that it is a bad idea. I am the answer to that, and I am booked out most of October because of it.',
 array['Nepali','English','Gurung','French'],'mardi-himal',5,'mardi-solo-women-welcome','Mardi Himal, solo travellers welcome',
 'Five days on the Mardi ridge with a guide most of whose clients arrive on their own. Small groups, and never a group you were not told about.'),

(26,'dil-bahadur-gurung','Dil Bahadur Gurung','dilbahadur@example.com','male','Manang',3,21,4600,0.98,35,61,'bank',
 'From Manang, at 3,500m — altitude is where he is comfortable',
 'I was born at three and a half thousand metres and I have spent twenty-one years watching people arrive there from sea level. I can usually tell who is in trouble a day before they can. I am not always popular for saying so.',
 array['Nepali','English','Gurung','Tibetan','German'],'annapurna-circuit',17,'annapurna-manang-born','Annapurna Circuit with a Manangi',
 'Seventeen days over Thorong La led by a man born on the route at 3,500m. Two acclimatisation days in his own village, and a frank assessment of how you are doing.'),

(27,'krishna-thapa','Krishna Thapa','krishnat@example.com','male','Gorkha',2,11,3600,0.92,62,27,'khalti',
 'Does the Manaslu paperwork himself and has never had a permit fail',
 'The restricted area permit defeats a lot of agencies. I have walked the Immigration office in Kathmandu enough times to know exactly what they want and in what order. Nobody on my trek has ever been turned back at Jagat.',
 array['Nepali','English','Hindi'],'manaslu-circuit',14,'manaslu-permits-sorted','Manaslu Circuit, paperwork handled',
 'Fourteen days around the eighth-highest mountain on earth, with the restricted-area permit run by someone who does it monthly rather than annually.'),

(28,'ramesh-thapa','Ramesh Thapa','rameshthapa@example.com','male','Kaski',1,4,2900,0.90,72,9,'esewa',
 'Was a trek cook for six years and still carries the good spices',
 'Six years in lodge kitchens before I got my licence. I still argue with cooks about dal and I usually win. Nobody has ever complained about the food on my treks.',
 array['Nepali','English','Hindi'],'mardi-himal',5,'mardi-eat-properly','Mardi Himal with an ex-trek cook',
 'Five days on the ridge with a guide who spent six years in the kitchens. The mountain is the same for everyone; dinner is not.'),

(29,'sabina-thapa','Sabina Thapa','sabinat@example.com','female','Kathmandu',1,3,2800,0.94,48,7,'khalti',
 'Newest licence of the group and works harder than all of us',
 'I am three years in and I know it. What I have is time, patience and a phone that is always answered. Ask me anything at eleven at night and you will get a reply.',
 array['Nepali','English','Newari','Spanish'],'langtang-valley',8,'langtang-first-himalaya','Langtang Valley, your first Himalaya',
 'Eight days in the friendliest big valley in Nepal, with a guide who answers every question and never makes you feel slow for asking.'),

(30,'hari-poudel','Hari Poudel','harip@example.com','male','Chitwan',1,8,3000,0.91,80,15,'bank',
 'Birdwatcher — will stop the whole group for a laughing thrush',
 'I came to trekking from wildlife guiding in Chitwan. The Himalaya has better birds than anyone tells you and I have not managed to stop pointing them out.',
 array['Nepali','English','Hindi','Tharu'],'mardi-himal',6,'mardi-birds-and-ridge','Mardi Himal for birdwatchers',
 'Six days up the forested Mardi ridge with binoculars and a guide who came from wildlife work. Rhododendron forest, and about forty species if the weather holds.'),

(31,'suman-shrestha','Suman Shrestha','sumans@example.com','male','Kathmandu',2,10,3400,0.95,42,24,'esewa',
 'History graduate who cannot walk past a mani wall in silence',
 'I studied history at Tribhuvan and I guide because it is the only job where people ask me about it. The valley is covered in things that mean something. I will tell you what, if you want to know.',
 array['Nepali','English','Newari','Hindi'],'langtang-valley',9,'langtang-and-its-history','Langtang Valley and what it means',
 'Nine days through the valley with a history graduate. The monastery, the cheese factory, the mani walls, and the reason each of them is where it is.'),

(32,'nisha-shrestha','Nisha Shrestha','nishas@example.com','female','Bhaktapur',1,5,2900,0.93,58,12,'khalti',
 'Runs the Bhaktapur pottery walk and the ridge trek with equal seriousness',
 'I do day walks in the old city and treks in Annapurna, and people are surprised that it is the same person. Both are about noticing things. One just has more stairs.',
 array['Nepali','English','Newari'],'mardi-himal',5,'mardi-ridge-slow','Mardi Himal, five gentle days',
 'Five unhurried days to the Mardi viewpoint. Built for people who want the Himalaya without a fortnight or a fitness plan.'),

(33,'rajendra-shrestha','Rajendra Shrestha','rajendras@example.com','male','Lalitpur',2,15,3500,0.94,50,33,'bank',
 'Fifteen years and still writes every client a handwritten kit list',
 'I do not trust the internet''s packing lists. I write yours myself, for your trek and your month, and I have never had someone arrive with the wrong sleeping bag.',
 array['Nepali','English','Newari','Hindi','Japanese'],'langtang-valley',9,'langtang-properly-packed','Langtang Valley, properly prepared',
 'Nine days in Langtang with a guide who plans the trek before you arrive — kit, pace and rest days, written down and agreed.'),

(34,'deepak-rai','Deepak Rai','deepakr@example.com','male','Khotang',1,7,3100,0.90,90,13,'esewa',
 'Walked to school for two hours each way, which explains a lot',
 'Where I grew up you walked or you did not go. Fourteen days to Base Camp does not feel like an expedition to me, and that calm tends to be contagious.',
 array['Nepali','English','Rai','Hindi'],'everest-base-camp',15,'ebc-fifteen-days','Everest Base Camp in fifteen days',
 'An extra day over the standard itinerary, spent where the altitude actually asks for it. Guided by someone for whom long walking days are simply normal.'),

(35,'sumitra-rai','Sumitra Rai','sumitrar@example.com','female','Bhojpur',1,4,2900,0.92,66,8,'khalti',
 'Rock climber — her rest days are harder than her trekking days',
 'I climb at Nagarjun most weekends. It means I am usually the fittest person on the trek and I have to work at not walking too fast. I am getting better at it.',
 array['Nepali','English','Rai'],'langtang-valley',8,'langtang-and-kyanjin-ri','Langtang Valley plus Kyanjin Ri',
 'Eight days with the summit day taken seriously — up Kyanjin Ri at dawn with a guide who climbs for fun.'),

(36,'bikash-limbu','Bikash Limbu','bikashl@example.com','male','Taplejung',2,12,3600,0.91,75,28,'bank',
 'Twelve years in the far east, where the trails have no signs',
 'Kanchenjunga and Makalu taught me to navigate without waymarks. On a busy circuit that skill is wasted, which is why I mostly work where the crowds are not.',
 array['Nepali','English','Limbu','Hindi'],'manaslu-circuit',15,'manaslu-fifteen','Manaslu Circuit, fifteen days',
 'A day longer than most so Samagaon gets a proper acclimatisation stop before Larkya La. Guided by someone at home in unmarked country.'),

(37,'chandra-limbu','Chandra Limbu','chandral@example.com','male','Panchthar',1,3,2800,0.94,54,6,'khalti',
 'Grew up in the tea gardens and can tell you why yours is bad',
 'Ilam and Panchthar are tea country. I am insufferable about it. I carry my own and I will make you some at every stop, and after four days you will not want the lodge stuff either.',
 array['Nepali','English','Limbu'],'langtang-valley',8,'langtang-tea-country-guide','Langtang Valley with a tea grower''s son',
 'Eight days through Langtang, with better tea than the lodges serve and a guide three years in who is still delighted by all of it.'),

(38,'sonam-lama','Sonam Lama','sonaml@example.com','male','Dolakha',2,14,3900,0.95,46,32,'esewa',
 'Spent four years as a monk before deciding he preferred walking',
 'I was in the monastery at Charikot from twelve to sixteen. I left, but the habits stayed — I am early, I am quiet in the mornings, and I do not get rattled. People tell me it makes the trek calmer.',
 array['Nepali','English','Tibetan','Tamang'],'gokyo-lakes',12,'gokyo-quiet-mornings','Gokyo Lakes, quiet mornings',
 'Twelve days to the lakes with early starts, unhurried afternoons and a guide who was a monk before he was a guide.'),

(39,'pema-lama','Pema Lama','pemal@example.com','female','Dolpa',2,11,4000,0.90,95,22,'bank',
 'From Dolpa, where a trek to the shop is three days',
 'Upper Dolpa is the most remote inhabited country in Nepal and it is where I am from. I have a very high tolerance for hard, empty places and a very low tolerance for people who underestimate them.',
 array['Nepali','English','Tibetan'],'manaslu-circuit',14,'manaslu-remote-by-standards','Manaslu Circuit with a Dolpa guide',
 'Fourteen days around Manaslu led by a woman from the most remote district in the country. Straight answers about what the pass will ask of you.'),

(40,'tsering-gyalpo','Tsering Gyalpo','tseringg@example.com','male','Mustang',3,22,4500,0.97,36,64,'esewa',
 'Twenty-two years, and he has walked to Lo Manthang in winter',
 'I have guided since I was twenty-three. Mustang in February, Thorong La in every month it is passable, and one crossing I should not have attempted and will tell you about if you ask. Experience is mostly a list of things you now refuse to do.',
 array['Nepali','English','Tibetan','Gurung','French'],'annapurna-circuit',16,'annapurna-and-into-mustang','Annapurna Circuit, ending in Mustang',
 'Sixteen days over Thorong La and down into the guide''s own country — Kagbeni, Jomsom, and the wind that arrives every day at eleven.'),

(41,'yangzom-gurung','Yangzom Gurung','yangzomg@example.com','female','Mustang',1,6,3200,0.93,60,14,'khalti',
 'Speaks the Mustang dialects nobody else on the platform does',
 'Upper Mustang villages do not run on Nepali. I can talk to the grandmother in the kitchen, and that changes what a village is willing to show you. It is the whole reason to hire me.',
 array['Nepali','English','Tibetan','Gurung'],'annapurna-circuit',15,'annapurna-north-side','Annapurna Circuit, the northern half',
 'Fifteen days with the descent into Mustang guided by someone from there — doors open that would otherwise stay shut.'),

(42,'naresh-magar','Naresh Magar','nareshm@example.com','male','Myagdi',1,8,3100,0.91,68,16,'bank',
 'Ex-British Gurkha, and unbothered by weather of any kind',
 'Six years in the regiment, then I came home to Myagdi. I am organised to a fault and I have never once been cold. My clients occasionally are, and I have learned to notice.',
 array['Nepali','English','Magar','Hindi'],'mardi-himal',6,'mardi-any-weather','Mardi Himal in any weather',
 'Six days on the ridge with a former Gurkha running the logistics. Contingency for the days the cloud comes in, which it will.'),

(43,'kalpana-magar','Kalpana Magar','kalpanam@example.com','female','Baglung',1,5,3000,0.94,52,11,'esewa',
 'Teaches at a village school out of season and it shows',
 'I teach class four in Baglung from June to September. Explaining things clearly to people who are tired and slightly frightened turns out to be the same job.',
 array['Nepali','English','Magar'],'mardi-himal',5,'mardi-well-explained','Mardi Himal, everything explained',
 'Five days with a guide who teaches for half the year. Nothing assumed, nothing rushed, and no question treated as a stupid one.'),

(44,'til-bahadur-pun','Til Bahadur Pun','tilbahadur@example.com','male','Myagdi',2,18,3700,0.93,55,38,'khalti',
 'Eighteen years on the Annapurna trails and knows every lodge owner by name',
 'I have been walking the same hills since 2008 and I have watched the children of lodge owners grow up and take over. When a place is full, it is not full for me. That is not a small thing in October.',
 array['Nepali','English','Magar','Nepal Bhasa'],'annapurna-circuit',16,'annapurna-known-everywhere','Annapurna Circuit with a familiar face',
 'Sixteen days with a guide the lodges have known for eighteen years. Rooms in high season, and better ones.'),

(45,'jeevan-bhattarai','Jeevan Bhattarai','jeevanb@example.com','male','Ilam',1,6,2900,0.92,64,12,'bank',
 'Came to guiding from teaching English and it is very obvious',
 'I taught English in Ilam for four years. My clients tell me I over-explain. My clients also tell me they understood every word, which is not something everyone gets in Nepal.',
 array['Nepali','English','Limbu','Hindi'],'langtang-valley',8,'langtang-plain-english','Langtang Valley in plain English',
 'Eight days in Langtang with a former English teacher. Useful when the altitude briefing actually matters.'),

(46,'manoj-adhikari','Manoj Adhikari','manoja@example.com','male','Syangja',2,12,3400,0.95,44,26,'esewa',
 'Runs the trek like a schedule and hits it to the hour',
 'Twelve years and I have missed one flight, which was not mine. If you like knowing what happens next, we will get on. If you want to improvise, I am the wrong guide and I will say so.',
 array['Nepali','English','Hindi','Korean'],'mardi-himal',5,'mardi-on-schedule','Mardi Himal, on schedule',
 'Five days planned to the hour by a guide who is faintly obsessive about it. For trekkers with a flight to catch.'),

(47,'ganesh-chaudhary','Ganesh Chaudhary','ganeshc@example.com','male','Chitwan',1,9,3000,0.89,100,17,'khalti',
 'Tharu, from the flatlands, and honest that the hills were learned',
 'I am not a mountain person by birth and I do not pretend to be. I learned these trails properly, over nine years, the way my clients are learning them. That turns out to make me better at explaining them, not worse.',
 array['Nepali','English','Tharu','Hindi'],'mardi-himal',6,'mardi-learned-the-hard-way','Mardi Himal with a flatlander',
 'Six days on the ridge with a guide from the Terai who learned this country as an adult, and remembers what was hard about it.'),

(48,'aakash-karki','Aakash Karki','aakashk@example.com','male','Dhankuta',1,3,2700,0.95,40,5,'esewa',
 'Cheapest day rate on the platform and openly working his way up',
 'I am three years and five platform treks in. I charge less than everyone because I have less to show, and I would rather say that plainly than pretend. Book me now; I do not intend to stay this cheap.',
 array['Nepali','English','Rai'],'everest-base-camp',14,'ebc-with-aakash','Everest Base Camp on a budget',
 'The classic fourteen days at the lowest guide rate on Trek, led by someone early in his career and visibly determined about it.');

-- Auth rows (empty-string token columns — GoTrue's scanner errors on NULLs).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new,
                        email_change, email_change_token_current, phone_change,
                        phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000',
       ('11111111-1111-1111-1111-' || lpad((c.n + 100)::text, 12, '0'))::uuid,
       'authenticated', 'authenticated', c.email, now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', '', '', '', '', ''
from _seed_cohort c
on conflict (id) do nothing;

insert into public.users (id, role, email, phone, full_name, country_code, avatar_url)
select ('11111111-1111-1111-1111-' || lpad((c.n + 100)::text, 12, '0'))::uuid,
       'guide', c.email, '+97798000000' || c.n, c.full_name, 'NP', null
from _seed_cohort c
on conflict (id) do nothing;

-- Signup dates spread over three years so "member since" and the verification
-- receipt dates are not all the same afternoon.
insert into public.guides (user_id, slug, status, tier, gender, licence_no, licence_expiry,
  home_district, years_experience, day_rate_usd_cents, bio, hook_line, payout_method,
  payout_account, payout_account_name, response_rate, median_response_mins,
  treks_completed_platform, created_at)
select ('11111111-1111-1111-1111-' || lpad((c.n + 100)::text, 12, '0'))::uuid,
       c.slug, 'verified', c.tier, c.gender,
       'TAAN-' || (1100 + c.n)::text,
       (current_date + ((c.n % 5) + 1) * interval '1 year')::date,
       c.district, c.years, c.rate, c.bio, c.hook, c.payout,
       upper(left(c.payout, 3)) || '-' || (9000 + c.n)::text, c.full_name,
       c.resp, c.mins, c.done,
       now() - ((c.n * 23) % 1000) * interval '1 day'
from _seed_cohort c
on conflict (user_id) do nothing;

insert into public.guide_languages (guide_id, language, proficiency)
select ('11111111-1111-1111-1111-' || lpad((c.n + 100)::text, 12, '0'))::uuid,
       l.language,
       case
         when l.ord = 1 then 'native'
         when l.language = 'English' then case when c.tier >= 2 then 'fluent' else 'conversational' end
         when l.ord = 3 then 'native'
         else 'basic'
       end
from _seed_cohort c
cross join lateral unnest(c.langs) with ordinality as l(language, ord)
on conflict do nothing;

insert into public.guide_photos (guide_id, url, kind, alt_text, sort)
select ('11111111-1111-1111-1111-' || lpad((c.n + 100)::text, 12, '0'))::uuid,
       '/img/guides/' || c.slug || '.jpg', 'headshot',
       c.full_name || ', licensed trekking guide from ' || c.district, 0
from _seed_cohort c
on conflict do nothing;

-- One trek each, on an existing route (so route pages and cover photos hold).
-- The publish guard + touch triggers are user triggers; FK/constraint triggers
-- stay on.
alter table public.offerings disable trigger user;

insert into public.offerings (id, guide_id, slug, kind, route_id, title, summary, days,
  price_usd_cents, max_party, min_party, meeting_point, included, excluded, itinerary,
  cover_photo_url, status)
select ('55555555-5555-5555-5555-' || lpad((c.n + 8)::text, 12, '0'))::uuid,
       ('11111111-1111-1111-1111-' || lpad((c.n + 100)::text, 12, '0'))::uuid,
       c.offer_slug, 'trek', r.id, c.title, c.summary, c.days,
       null,
       case when c.tier = 3 then 6 when c.tier = 2 then 8 else 10 end,
       1,
       case r.slug
         when 'everest-base-camp' then 'Lukla airport'
         when 'gokyo-lakes' then 'Lukla airport'
         when 'annapurna-circuit' then 'Besisahar'
         when 'langtang-valley' then 'Syabrubesi'
         when 'manaslu-circuit' then 'Soti Khola'
         else 'Pokhara'
       end,
       '{"Guide","Teahouse lodging","All permits"}',
       '{"Meals","Travel insurance","Tips"}',
       ('[{"day":1,"title":"Meet your guide and start walking"}]')::jsonb,
       '/img/routes/' || r.slug || '.jpg',
       'live'
from _seed_cohort c
join public.routes r on r.slug = c.route
on conflict (id) do nothing;

alter table public.offerings enable trigger user;

-- ---- the generic passes, repeated for the cohort ---------------------------
-- Each of these mirrors a pass in seed.sql that already ran before this file.
-- All are `where not exists` / idempotent updates, so re-running is a no-op for
-- the original twelve.

-- Calendars: open for the next 270 days, with a scattered handful blocked so
-- no two guides have an identical month.
insert into public.availability (guide_id, day, status)
select c.user_id, d::date, 'open'
from (select ('11111111-1111-1111-1111-' || lpad((n + 100)::text, 12, '0'))::uuid as user_id
      from _seed_cohort) c,
     generate_series(current_date, current_date + 270, interval '1 day') d
on conflict do nothing;

update public.availability a set status = 'blocked'
from _seed_cohort c
where a.guide_id = ('11111111-1111-1111-1111-' || lpad((c.n + 100)::text, 12, '0'))::uuid
  and a.status = 'open'
  and (abs(hashtext(a.guide_id::text || a.day::text)) % 11) = 0;

-- v3 price breakdowns on the new treks.
update public.offerings o set price_breakdown = jsonb_build_object(
    'guide_fee_total_usd_cents', coalesce(g.day_rate_usd_cents, 4500) * o.days,
    'permits_usd_cents', 9200,
    'porters_usd_cents', case when o.days >= 7 then 8400 else 3000 end,
    'logistics_usd_cents', o.days * 1500,
    'trek_pct', 0.10,
    'fund_pct', 0.03)
  from public.guides g
  where g.user_id = o.guide_id and o.kind = 'trek' and o.price_breakdown is null;

-- v3 §12: every trek carries a named backup guide, never the lead themselves.
with verified as (
  select user_id, row_number() over (order by user_id) as rn, count(*) over () as n
  from public.guides where status = 'verified'
),
leads as (
  select o.id as offering_id, v.rn
  from public.offerings o join verified v on v.user_id = o.guide_id
  where o.kind = 'trek' and o.backup_guide_id is null
)
update public.offerings o
set backup_guide_id = pick.user_id
from leads l
join verified pick on pick.rn = (l.rn % (select max(n) from verified)) + 1
where o.id = l.offering_id;

-- Verification receipts + the porter-welfare pledge.
insert into public.guide_verifications (guide_id, check_type, status, verified_at, expires_at)
select g.user_id, ct.check_type, 'passed',
       g.created_at + interval '3 days',
       case when ct.check_type in ('licence','first_aid')
            then g.created_at + interval '3 days' + interval '2 years' end
from public.guides g
cross join (values ('licence'),('id_match'),('phone'),('reference_1'),('first_aid')) as ct(check_type)
where g.status = 'verified'
  and not exists (select 1 from public.guide_verifications gv
                  where gv.guide_id = g.user_id and gv.check_type = ct.check_type);

update public.guides set porter_welfare = true where status = 'verified' and tier >= 2;

-- Real photography: portraits are on disk at /img/guides/<slug>.jpg, trek
-- covers are shared per route.
update public.users u set avatar_url = '/img/guides/' || g.slug || '.jpg'
from public.guides g where g.user_id = u.id and g.status = 'verified';

update public.offerings o set cover_photo_url = '/img/routes/' || r.slug || '.jpg'
from public.routes r where r.id = o.route_id and o.kind = 'trek';

-- Demo logins for the whole cohort (same password as the original twelve).
update auth.users u
set encrypted_password = extensions.crypt('TrekDemo2026', extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(u.email_confirmed_at, now())
from public.users pu
where pu.id = u.id and pu.role = 'guide' and u.encrypted_password is null;

-- Gender on the original twelve, so the "women guides" filter is honest about
-- the guides who were already here.
update public.guides set gender = 'female'
  where slug in ('sunita-gurung','anjali-rai') and gender is null;
update public.guides set gender = 'male'
  where status = 'verified' and gender is null;

drop table _seed_cohort;
