-- seed.sql — a browsable fake marketplace: 12 guides, 6 routes (real permit
-- data), 20 offerings (8 treks + 12 experiences), availability, and 10 published
-- reviews. Runs as superuser on `supabase db reset` (bypasses RLS). Keep this in
-- sync so a fresh clone can demo (CLAUDE.md working agreement).

-- ============ AUTH + USERS ============
-- Fake auth.users so the public.users FK resolves. The empty-string token
-- columns are required — GoTrue's scanner errors on NULLs ("Database error
-- loading user"). Only the ops account gets a password (dev console login);
-- trekker/guide auth is built in M4.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change_token_new,
                        email_change, email_change_token_current, phone_change,
                        phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
       v.email, now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       '', '', '', '', '', '', '', ''
from (values
  ('11111111-1111-1111-1111-000000000001'::uuid,'pemba@example.com'),
  ('11111111-1111-1111-1111-000000000002'::uuid,'dawa@example.com'),
  ('11111111-1111-1111-1111-000000000003'::uuid,'mingma@example.com'),
  ('11111111-1111-1111-1111-000000000004'::uuid,'nima@example.com'),
  ('11111111-1111-1111-1111-000000000005'::uuid,'lakpa@example.com'),
  ('11111111-1111-1111-1111-000000000006'::uuid,'tashi@example.com'),
  ('11111111-1111-1111-1111-000000000007'::uuid,'sunita@example.com'),
  ('11111111-1111-1111-1111-000000000008'::uuid,'binod@example.com'),
  ('11111111-1111-1111-1111-000000000009'::uuid,'karma@example.com'),
  ('11111111-1111-1111-1111-000000000010'::uuid,'phurba@example.com'),
  ('11111111-1111-1111-1111-000000000011'::uuid,'anjali@example.com'),
  ('11111111-1111-1111-1111-000000000012'::uuid,'raju@example.com'),
  ('22222222-2222-2222-2222-000000000001'::uuid,'sarah@example.com'),
  ('22222222-2222-2222-2222-000000000002'::uuid,'liam@example.com'),
  ('22222222-2222-2222-2222-000000000003'::uuid,'yuki@example.com'),
  ('22222222-2222-2222-2222-000000000004'::uuid,'marco@example.com'),
  ('22222222-2222-2222-2222-000000000005'::uuid,'emma@example.com'),
  ('22222222-2222-2222-2222-000000000006'::uuid,'noah@example.com'),
  ('33333333-3333-3333-3333-000000000001'::uuid,'ops@example.com')
) as v(id, email);

insert into public.users (id, role, email, phone, full_name, country_code, avatar_url) values
  ('11111111-1111-1111-1111-000000000001','guide','pemba@example.com','+9779800000001','Pemba Sherpa','NP','https://img.example/av/pemba.jpg'),
  ('11111111-1111-1111-1111-000000000002','guide','dawa@example.com','+9779800000002','Dawa Sherpa','NP','https://img.example/av/dawa.jpg'),
  ('11111111-1111-1111-1111-000000000003','guide','mingma@example.com','+9779800000003','Mingma Sherpa','NP','https://img.example/av/mingma.jpg'),
  ('11111111-1111-1111-1111-000000000004','guide','nima@example.com','+9779800000004','Nima Tamang','NP','https://img.example/av/nima.jpg'),
  ('11111111-1111-1111-1111-000000000005','guide','lakpa@example.com','+9779800000005','Lakpa Sherpa','NP','https://img.example/av/lakpa.jpg'),
  ('11111111-1111-1111-1111-000000000006','guide','tashi@example.com','+9779800000006','Tashi Gurung','NP','https://img.example/av/tashi.jpg'),
  ('11111111-1111-1111-1111-000000000007','guide','sunita@example.com','+9779800000007','Sunita Gurung','NP','https://img.example/av/sunita.jpg'),
  ('11111111-1111-1111-1111-000000000008','guide','binod@example.com','+9779800000008','Binod Tamang','NP','https://img.example/av/binod.jpg'),
  ('11111111-1111-1111-1111-000000000009','guide','karma@example.com','+9779800000009','Karma Bhote','NP','https://img.example/av/karma.jpg'),
  ('11111111-1111-1111-1111-000000000010','guide','phurba@example.com','+9779800000010','Phurba Sherpa','NP','https://img.example/av/phurba.jpg'),
  ('11111111-1111-1111-1111-000000000011','guide','anjali@example.com','+9779800000011','Anjali Rai','NP','https://img.example/av/anjali.jpg'),
  ('11111111-1111-1111-1111-000000000012','guide','raju@example.com','+9779800000012','Raju Magar','NP','https://img.example/av/raju.jpg'),
  ('22222222-2222-2222-2222-000000000001','trekker','sarah@example.com',null,'Sarah Klein','DE',null),
  ('22222222-2222-2222-2222-000000000002','trekker','liam@example.com',null,'Liam Walsh','IE',null),
  ('22222222-2222-2222-2222-000000000003','trekker','yuki@example.com',null,'Yuki Tanaka','JP',null),
  ('22222222-2222-2222-2222-000000000004','trekker','marco@example.com',null,'Marco Rossi','IT',null),
  ('22222222-2222-2222-2222-000000000005','trekker','emma@example.com',null,'Emma Dubois','FR',null),
  ('22222222-2222-2222-2222-000000000006','trekker','noah@example.com',null,'Noah Smith','US',null),
  ('33333333-3333-3333-3333-000000000001','ops','ops@example.com',null,'Ops Team','NP',null);

-- ============ GUIDES ============
insert into public.guides (user_id, slug, status, tier, licence_no, licence_expiry,
  home_district, years_experience, day_rate_usd_cents, bio, hook_line, payout_method,
  payout_account, payout_account_name, response_rate, median_response_mins, treks_completed_platform) values
  ('11111111-1111-1111-1111-000000000001','pemba-sherpa','verified',3,'TAAN-1001','2028-05-01','Solukhumbu',14,4500,'I grew up in Khumjung, an hour below Everest View Hotel. I have walked to Base Camp more times than I can count and I know every teahouse from Lukla to Gorak Shep.','Knows every teahouse from Lukla to Gorak Shep','esewa','98000ESW1','Pemba Sherpa',0.98,42,37),
  ('11111111-1111-1111-1111-000000000002','dawa-sherpa','verified',2,'TAAN-1002','2027-11-01','Solukhumbu',9,3800,'Everest and the Three Passes are my backyard. I trek slow and steady so you actually enjoy the altitude.','Three Passes specialist who swears by going slow','bank','NIC-0092','Dawa Sherpa',0.95,60,21),
  ('11111111-1111-1111-1111-000000000003','mingma-sherpa','verified',3,'TAAN-1003','2029-02-01','Solukhumbu',18,4800,'Eighteen years, two Everest summits as a climbing guide. On trek I care about one thing: you come home safe and grinning.','Two-time Everest summiter, obsessive about safety','esewa','98000ESW3','Mingma Sherpa',0.99,30,52),
  ('11111111-1111-1111-1111-000000000004','nima-tamang','verified',1,'TAAN-1004','2027-08-01','Rasuwa',6,3000,'Langtang is my home valley — we lost so much in 2015 and rebuilt. Let me show you the valley that raised me.','Born in Langtang, rebuilt it after the quake','khalti','98000KHL4','Nima Tamang',0.92,90,12),
  ('11111111-1111-1111-1111-000000000005','lakpa-sherpa','verified',2,'TAAN-1005','2028-03-01','Solukhumbu',11,4000,'Gokyo Lakes at sunrise is the most beautiful thing I know. I will get you there and back on your own pace.','Gokyo Lakes at sunrise is his religion','bank','NIC-0095','Lakpa Sherpa',0.96,48,28),
  ('11111111-1111-1111-1111-000000000006','tashi-gurung','verified',2,'TAAN-1006','2027-12-01','Kaski',10,3500,'Annapurna is in my blood — I was born in Ghandruk. I know the quiet side trails the big groups never see.','Ghandruk-born, knows the quiet Annapurna trails','esewa','98000ESW6','Tashi Gurung',0.94,55,24),
  ('11111111-1111-1111-1111-000000000007','sunita-gurung','verified',2,'TAAN-1007','2028-09-01','Kaski',8,3600,'One of the few women leading treks in Annapurna. Solo women travellers, I have got you.','A rare woman guide leading Annapurna, and proud of it','khalti','98000KHL7','Sunita Gurung',0.97,35,19),
  ('11111111-1111-1111-1111-000000000008','binod-tamang','verified',1,'TAAN-1008','2027-10-01','Gorkha',7,3200,'Manaslu is wild and restricted and glorious. Fewer people, bigger mountains.','Manaslu restricted-area specialist','bank','NIC-0098','Binod Tamang',0.90,120,9),
  ('11111111-1111-1111-1111-000000000009','karma-bhote','verified',1,'TAAN-1009','2028-01-01','Taplejung',6,3300,'Kanchenjunga east is remote — this is trekking for people who want the real, hard, empty trails.','Takes you where almost no one else goes','esewa','98000ESW9','Karma Bhote',0.88,140,7),
  ('11111111-1111-1111-1111-000000000010','phurba-sherpa','verified',3,'TAAN-1010','2029-04-01','Dolakha',15,4600,'Rolwaling and Tashi Lapcha — technical, glaciated, unforgettable. Only for fit trekkers, and I will tell you honestly if you are ready.','Honest to a fault about whether you are ready','bank','NIC-0100','Phurba Sherpa',0.98,40,41),
  ('11111111-1111-1111-1111-000000000011','anjali-rai','verified',1,'TAAN-1011','2027-07-01','Sankhuwasabha',5,3100,'Makalu Barun is my quiet corner of the Himalaya. Rhododendrons, no crowds, big skies.','Makalu Barun, rhododendrons and zero crowds','khalti','98000KHL11','Anjali Rai',0.91,75,8),
  ('11111111-1111-1111-1111-000000000012','raju-magar','verified',2,'TAAN-1012','2028-06-01','Kaski',9,3400,'Mardi Himal and Poon Hill are perfect first Himalayan treks. Short, stunning, and I make them fun.','Makes first-timers fall in love with the Himalaya','esewa','98000ESW12','Raju Magar',0.95,50,33);

insert into public.guide_languages (guide_id, language, proficiency) values
  ('11111111-1111-1111-1111-000000000001','Nepali','native'),('11111111-1111-1111-1111-000000000001','English','fluent'),('11111111-1111-1111-1111-000000000001','Sherpa','native'),
  ('11111111-1111-1111-1111-000000000002','Nepali','native'),('11111111-1111-1111-1111-000000000002','English','conversational'),
  ('11111111-1111-1111-1111-000000000003','Nepali','native'),('11111111-1111-1111-1111-000000000003','English','fluent'),('11111111-1111-1111-1111-000000000003','Hindi','conversational'),
  ('11111111-1111-1111-1111-000000000004','Nepali','native'),('11111111-1111-1111-1111-000000000004','English','conversational'),('11111111-1111-1111-1111-000000000004','Tamang','native'),
  ('11111111-1111-1111-1111-000000000005','Nepali','native'),('11111111-1111-1111-1111-000000000005','English','fluent'),('11111111-1111-1111-1111-000000000005','German','basic'),
  ('11111111-1111-1111-1111-000000000006','Nepali','native'),('11111111-1111-1111-1111-000000000006','English','fluent'),('11111111-1111-1111-1111-000000000006','Gurung','native'),
  ('11111111-1111-1111-1111-000000000007','Nepali','native'),('11111111-1111-1111-1111-000000000007','English','fluent'),('11111111-1111-1111-1111-000000000007','French','basic'),
  ('11111111-1111-1111-1111-000000000008','Nepali','native'),('11111111-1111-1111-1111-000000000008','English','conversational'),
  ('11111111-1111-1111-1111-000000000009','Nepali','native'),('11111111-1111-1111-1111-000000000009','English','conversational'),
  ('11111111-1111-1111-1111-000000000010','Nepali','native'),('11111111-1111-1111-1111-000000000010','English','fluent'),('11111111-1111-1111-1111-000000000010','Japanese','basic'),
  ('11111111-1111-1111-1111-000000000011','Nepali','native'),('11111111-1111-1111-1111-000000000011','English','conversational'),('11111111-1111-1111-1111-000000000011','Rai','native'),
  ('11111111-1111-1111-1111-000000000012','Nepali','native'),('11111111-1111-1111-1111-000000000012','English','fluent'),('11111111-1111-1111-1111-000000000012','Spanish','basic');

insert into public.guide_photos (guide_id, url, kind, alt_text, sort) values
  ('11111111-1111-1111-1111-000000000001','https://img.example/g/pemba-1.jpg','headshot','Pemba Sherpa smiling in a down jacket at Base Camp',0),
  ('11111111-1111-1111-1111-000000000001','https://img.example/g/pemba-2.jpg','trail','Pemba leading a group across a suspension bridge',1),
  ('11111111-1111-1111-1111-000000000003','https://img.example/g/mingma-1.jpg','headshot','Mingma Sherpa in front of Everest',0),
  ('11111111-1111-1111-1111-000000000006','https://img.example/g/tashi-1.jpg','headshot','Tashi Gurung on a ridge above Ghandruk',0),
  ('11111111-1111-1111-1111-000000000007','https://img.example/g/sunita-1.jpg','headshot','Sunita Gurung with prayer flags behind her',0);

-- ============ ROUTES + PERMITS (real permit data) ============
insert into public.routes (id, slug, name, region, typical_days, max_altitude_m, difficulty, requires_licensed_guide, season_months) values
  ('44444444-4444-4444-4444-000000000001','everest-base-camp','Everest Base Camp','Khumbu',14,5644,'hard',true,'{3,4,5,10,11}'),
  ('44444444-4444-4444-4444-000000000002','annapurna-circuit','Annapurna Circuit','Annapurna',16,5416,'hard',true,'{3,4,5,10,11}'),
  ('44444444-4444-4444-4444-000000000003','langtang-valley','Langtang Valley','Langtang',8,4984,'moderate',true,'{3,4,5,10,11}'),
  ('44444444-4444-4444-4444-000000000004','manaslu-circuit','Manaslu Circuit','Manaslu',14,5106,'strenuous',true,'{3,4,5,9,10,11}'),
  ('44444444-4444-4444-4444-000000000005','gokyo-lakes','Gokyo Lakes','Khumbu',12,5357,'hard',true,'{3,4,5,10,11}'),
  ('44444444-4444-4444-4444-000000000006','mardi-himal','Mardi Himal','Annapurna',5,4500,'moderate',true,'{2,3,4,5,10,11,12}');

insert into public.permits (route_id, name, cost_npr_paisa, cost_usd_cents, issuing_body, lead_time_days) values
  ('44444444-4444-4444-4444-000000000001','Sagarmatha National Park Entry',300000,2300,'DNPWC',3),
  ('44444444-4444-4444-4444-000000000001','Khumbu Pasang Lhamu Rural Municipality Fee',200000,1500,'Khumbu Pasang Lhamu RM',1),
  ('44444444-4444-4444-4444-000000000002','Annapurna Conservation Area Permit (ACAP)',300000,2300,'NTNC/ACAP',3),
  ('44444444-4444-4444-4444-000000000002','TIMS Card',200000,1500,'Nepal Tourism Board',2),
  ('44444444-4444-4444-4444-000000000003','Langtang National Park Entry',300000,2300,'DNPWC',3),
  ('44444444-4444-4444-4444-000000000003','TIMS Card',200000,1500,'Nepal Tourism Board',2),
  ('44444444-4444-4444-4444-000000000004','Manaslu Restricted Area Permit',1300000,10000,'Department of Immigration',7),
  ('44444444-4444-4444-4444-000000000004','Manaslu Conservation Area Permit (MCAP)',300000,2300,'NTNC',3),
  ('44444444-4444-4444-4444-000000000004','Annapurna Conservation Area Permit (ACAP)',300000,2300,'NTNC/ACAP',3),
  ('44444444-4444-4444-4444-000000000005','Sagarmatha National Park Entry',300000,2300,'DNPWC',3),
  ('44444444-4444-4444-4444-000000000005','Khumbu Pasang Lhamu Rural Municipality Fee',200000,1500,'Khumbu Pasang Lhamu RM',1),
  ('44444444-4444-4444-4444-000000000006','Annapurna Conservation Area Permit (ACAP)',300000,2300,'NTNC/ACAP',3);

-- ============ OFFERINGS ============
-- Disable user triggers (publish guard + touch) so the seed can insert live
-- offerings directly; FK/constraint triggers stay ON. Re-enabled below.
alter table public.offerings disable trigger user;

insert into public.offerings (id, guide_id, slug, kind, route_id, title, summary, days,
  price_usd_cents, max_party, min_party, meeting_point, included, excluded, itinerary, cover_photo_url, status) values
  -- 8 treks (price null — derived from day rate)
  ('55555555-5555-5555-5555-000000000001','11111111-1111-1111-1111-000000000001','ebc-classic-with-pemba','trek','44444444-4444-4444-4444-000000000001','Everest Base Camp, the classic 14 days','Walk to the foot of the highest mountain on earth with a guide who grew up beneath it. Teahouses, sunrise at Kala Patthar, and time to acclimatise properly.',14,null,8,1,'Lukla airport','{"Guide","Teahouse lodging","All permits","Airport transfers in Lukla"}','{"Lukla flights","Meals","Travel insurance","Tips"}','[{"day":1,"title":"Fly to Lukla, trek to Phakding"},{"day":2,"title":"Trek to Namche Bazaar"}]','https://img.example/o/ebc-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000002','11111111-1111-1111-1111-000000000003','ebc-safety-first','trek','44444444-4444-4444-4444-000000000001','Everest Base Camp with a mountaineer','Same iconic route, guided by a two-time Everest summiter who treats acclimatisation like a science. For trekkers who want an extra margin of safety.',15,null,6,1,'Lukla airport','{"Guide","Teahouse lodging","All permits","Oximeter monitoring"}','{"Lukla flights","Meals","Insurance"}','[{"day":1,"title":"Fly to Lukla"}]','https://img.example/o/ebc-2.jpg','live'),
  ('55555555-5555-5555-5555-000000000003','11111111-1111-1111-1111-000000000005','gokyo-lakes-sunrise','trek','44444444-4444-4444-4444-000000000005','Gokyo Lakes & Gokyo Ri','Turquoise glacial lakes and the finest sunrise view of Everest there is — from Gokyo Ri, away from the Base Camp crowds.',12,null,8,1,'Lukla airport','{"Guide","Teahouse lodging","All permits"}','{"Lukla flights","Meals","Insurance"}','[{"day":1,"title":"Fly to Lukla, trek to Phakding"}]','https://img.example/o/gokyo-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000004','11111111-1111-1111-1111-000000000006','annapurna-circuit-quiet','trek','44444444-4444-4444-4444-000000000002','Annapurna Circuit, the quiet way','The full circuit over Thorong La (5,416m) with a Ghandruk-born guide who knows the side trails the big groups skip.',16,null,8,1,'Besisahar','{"Guide","Teahouse lodging","ACAP & TIMS permits","Jeep to trailhead"}','{"Meals","Insurance","Tips"}','[{"day":1,"title":"Drive to Besisahar, trek to Bhulbhule"}]','https://img.example/o/annapurna-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000005','11111111-1111-1111-1111-000000000007','annapurna-circuit-women-welcome','trek','44444444-4444-4444-4444-000000000002','Annapurna Circuit with Sunita','The classic circuit led by one of the few women guides in Nepal — especially welcoming for solo women travellers.',15,null,6,1,'Besisahar','{"Guide","Teahouse lodging","ACAP & TIMS permits"}','{"Meals","Insurance"}','[{"day":1,"title":"Drive to Besisahar"}]','https://img.example/o/annapurna-2.jpg','live'),
  ('55555555-5555-5555-5555-000000000006','11111111-1111-1111-1111-000000000004','langtang-valley-rebuild','trek','44444444-4444-4444-4444-000000000003','Langtang Valley, home of my guide','A shorter, kinder Himalayan trek through the valley Nima rebuilt after 2015 — glaciers, yak cheese, and Kyanjin Ri.',8,null,8,1,'Syabrubesi','{"Guide","Teahouse lodging","Langtang NP & TIMS permits","Bus to Syabrubesi"}','{"Meals","Insurance"}','[{"day":1,"title":"Drive to Syabrubesi"}]','https://img.example/o/langtang-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000007','11111111-1111-1111-1111-000000000008','manaslu-circuit-restricted','trek','44444444-4444-4444-4444-000000000004','Manaslu Circuit, the wild one','A restricted-area trek around the eighth-highest mountain on earth. Fewer trekkers, bigger wilderness, Larkya La (5,106m).',14,null,6,2,'Soti Khola','{"Guide","Teahouse lodging","Restricted Area Permit","MCAP & ACAP","Jeep to trailhead"}','{"Meals","Insurance"}','[{"day":1,"title":"Drive to Soti Khola"}]','https://img.example/o/manaslu-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000008','11111111-1111-1111-1111-000000000012','mardi-himal-firsttimer','trek','44444444-4444-4444-4444-000000000006','Mardi Himal, a perfect first trek','Five days on a hidden ridge under Machapuchare — short, spectacular, and gentle enough for a first Himalayan trek.',5,null,10,1,'Pokhara','{"Guide","Teahouse lodging","ACAP permit","Transfers from Pokhara"}','{"Meals","Insurance"}','[{"day":1,"title":"Drive to Kande, trek to Forest Camp"}]','https://img.example/o/mardi-1.jpg','live'),
  -- 12 experiences (price per person)
  ('55555555-5555-5555-5555-000000000009','11111111-1111-1111-1111-000000000012','pokhara-sunrise-sarangkot','day_hike',null,'Sarangkot sunrise hike','A pre-dawn hike above Pokhara for the Annapurna and Machapuchare sunrise, back in time for breakfast.',1,3500,10,1,'Pokhara Lakeside','{"Guide","Tea at the top"}','{"Breakfast","Transport"}','[{"time":"04:30","title":"Meet in Lakeside"},{"time":"06:00","title":"Sunrise at Sarangkot"}]','https://img.example/o/sarangkot-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000010','11111111-1111-1111-1111-000000000006','ghandruk-village-day','day_hike',null,'Ghandruk Gurung village day walk','A gentle day among stone Gurung villages, terraced fields and Annapurna South views, ending with home-cooked dal bhat.',1,4500,8,1,'Nayapul','{"Guide","Dal bhat lunch","Jeep from Pokhara"}','{"Drinks"}','[{"time":"08:00","title":"Drive to Nayapul"},{"time":"10:00","title":"Walk up to Ghandruk"}]','https://img.example/o/ghandruk-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000011','11111111-1111-1111-1111-000000000007','pokhara-food-walk','food_culture',null,'Pokhara evening food walk','Newari samay baji, momos, sel roti and local millet raksi — a two-hour graze through Pokhara with a guide who knows every stall.',1,3000,8,1,'Pokhara Lakeside','{"Guide","All food tastings","One drink"}','{"Extra drinks"}','[{"time":"17:30","title":"Meet at the clock tower"}]','https://img.example/o/food-pokhara-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000012','11111111-1111-1111-1111-000000000001','kathmandu-momo-crawl','food_culture',null,'Kathmandu momo crawl','Five kinds of momo across old Kathmandu, from buff jhol momo to Tibetan kothey — with the stories behind each.',1,2800,8,1,'Thamel','{"Guide","All momo tastings"}','{"Drinks"}','[{"time":"18:00","title":"Meet in Thamel"}]','https://img.example/o/momo-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000013','11111111-1111-1111-1111-000000000001','patan-heritage-walk','city',null,'Patan Durbar Square heritage walk','A slow morning through Patan''s Newari courtyards, metalworkers'' alleys and the Golden Temple with a local guide.',1,2500,10,1,'Patan Durbar Square','{"Guide","Durbar Square entry"}','{"Museum entry"}','[{"time":"09:00","title":"Meet at Patan Durbar Square"}]','https://img.example/o/patan-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000014','11111111-1111-1111-1111-000000000003','kathmandu-heritage-temples','city',null,'Kathmandu temples & stupas','Boudhanath, Swayambhu and Pashupatinath in a day, with the rituals and meanings explained by someone who grew up with them.',1,3200,8,1,'Boudhanath','{"Guide","All temple entries"}','{"Lunch"}','[{"time":"08:30","title":"Boudhanath kora"}]','https://img.example/o/temples-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000015','11111111-1111-1111-1111-000000000012','pokhara-paragliding-hike','adventure',null,'Sarangkot paraglide + ridge hike','Hike the Sarangkot ridge, then tandem paraglide down over Phewa Lake with a certified pilot partner.',1,12000,4,1,'Pokhara Lakeside','{"Guide","Tandem paraglide flight","Transport"}','{"Photos/video add-on"}','[{"time":"09:00","title":"Ridge hike"},{"time":"11:00","title":"Fly"}]','https://img.example/o/paraglide-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000016','11111111-1111-1111-1111-000000000004','trishuli-rafting-day','adventure',null,'Trishuli River rafting day','Half a day of Grade III whitewater on the Trishuli, an easy drive from Kathmandu or Pokhara.',1,5500,8,1,'Charaudi','{"Guide","Raft, helmet & PFD","Riverside lunch"}','{"Transport"}','[{"time":"10:00","title":"Safety briefing & launch"}]','https://img.example/o/rafting-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000017','11111111-1111-1111-1111-000000000002','namche-acclimatisation-day','day_hike',null,'Namche acclimatisation day hike','A perfect rest-day walk to Everest View Hotel and the Khumjung monastery — helps you acclimatise and see Everest early.',1,4000,8,1,'Namche Bazaar','{"Guide"}','{"Food","Lodging"}','[{"time":"08:00","title":"Walk to Everest View Hotel"}]','https://img.example/o/namche-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000018','11111111-1111-1111-1111-000000000010','bhaktapur-pottery-culture','food_culture',null,'Bhaktapur pottery & juju dhau','The potters'' square, a hands-on clay session, and Bhaktapur''s famous "king of yoghurt" juju dhau.',1,3300,8,1,'Bhaktapur Durbar Square','{"Guide","Pottery session","Juju dhau tasting"}','{"City entry fee"}','[{"time":"10:00","title":"Potters'' Square"}]','https://img.example/o/bhaktapur-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000019','11111111-1111-1111-1111-000000000006','poon-hill-sunrise','day_hike',null,'Poon Hill sunrise (day option)','The famous Poon Hill panorama as a fast day option from Pokhara for those short on time.',1,6000,10,1,'Pokhara','{"Guide","Transport","Permits"}','{"Meals"}','[{"time":"04:00","title":"Drive & hike to Poon Hill"}]','https://img.example/o/poonhill-1.jpg','live'),
  ('55555555-5555-5555-5555-000000000020','11111111-1111-1111-1111-000000000007','pokhara-yoga-lakeside','food_culture',null,'Lakeside sunrise yoga & tea','A calm sunrise yoga session by Phewa Lake with a local instructor partner, finished with masala tea.',1,2000,12,1,'Pokhara Lakeside','{"Guide","Yoga session","Masala tea"}','{"Mat rental"}','[{"time":"06:00","title":"Sunrise yoga"}]','https://img.example/o/yoga-1.jpg','live');

alter table public.offerings enable trigger user;

insert into public.offering_photos (offering_id, url, alt_text, source, approved, sort) values
  ('55555555-5555-5555-5555-000000000001','https://img.example/o/ebc-1a.jpg','Trekkers on the trail to Everest Base Camp with prayer flags','guide',true,0),
  ('55555555-5555-5555-5555-000000000001','https://img.example/o/ebc-1b.jpg','Sunrise over Everest from Kala Patthar','trekker',true,1),
  ('55555555-5555-5555-5555-000000000004','https://img.example/o/annapurna-1a.jpg','Thorong La pass sign at 5416 metres','guide',true,0),
  ('55555555-5555-5555-5555-000000000011','https://img.example/o/food-pokhara-1a.jpg','A plate of Newari samay baji','guide',true,0);

-- ============ AVAILABILITY (open for the next 120 days, a few blocked) ============
insert into public.availability (guide_id, day, status)
select g.user_id, d::date, 'open'
from public.guides g,
     generate_series(current_date, current_date + 120, interval '1 day') d
on conflict do nothing;

-- Block a scattered handful of days per guide so calendars look real.
update public.availability set status = 'blocked'
where (extract(day from day)::int % 17) = 0;

-- ============ COMPLETED BOOKINGS + PUBLISHED REVIEWS ============
-- Ten completed bookings back ten released trekker→guide reviews.
insert into public.bookings (id, trekker_id, guide_id, offering_id, start_date, end_date,
  party_size, status, guide_fee_usd_cents, porter_fee_usd_cents, permit_fees_usd_cents,
  service_fee_usd_cents, permit_handling_usd_cents, total_usd_cents, commission_usd_cents,
  fx_rate_npr, guide_payout_npr_paisa, deposit_usd_cents, deposit_paid_at, balance_paid_at,
  completed_confirmed_at) values
  ('66666666-6666-6666-6666-000000000001','22222222-2222-2222-2222-000000000001','11111111-1111-1111-1111-000000000001','55555555-5555-5555-5555-000000000001',current_date - 40, current_date - 26,1,'completed',63000,0,3800,5040,2500,74340,9450,133,7119150,22302,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000002','22222222-2222-2222-2222-000000000002','11111111-1111-1111-1111-000000000003','55555555-5555-5555-5555-000000000002',current_date - 60, current_date - 45,1,'completed',72000,0,3800,5760,2500,84060,10800,133,8139600,25218,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000003','22222222-2222-2222-2222-000000000003','11111111-1111-1111-1111-000000000005','55555555-5555-5555-5555-000000000003',current_date - 35, current_date - 23,2,'completed',96000,0,7600,7680,2500,113780,14400,133,10852800,34134,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000004','22222222-2222-2222-2222-000000000004','11111111-1111-1111-1111-000000000006','55555555-5555-5555-5555-000000000004',current_date - 55, current_date - 39,1,'completed',56000,0,3800,4480,2500,66780,8400,133,7092800,20034,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000005','22222222-2222-2222-2222-000000000005','11111111-1111-1111-1111-000000000007','55555555-5555-5555-5555-000000000005',current_date - 30, current_date - 15,1,'completed',54000,0,3800,4320,2500,64620,8100,133,6842700,19386,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000006','22222222-2222-2222-2222-000000000006','11111111-1111-1111-1111-000000000004','55555555-5555-5555-5555-000000000006',current_date - 25, current_date - 17,3,'completed',72000,0,11400,5760,2500,91660,10800,133,10173600,27498,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000007','22222222-2222-2222-2222-000000000001','11111111-1111-1111-1111-000000000008','55555555-5555-5555-5555-000000000007',current_date - 70, current_date - 56,2,'completed',89600,0,29200,7168,2500,128468,13440,133,10141760,38540,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000008','22222222-2222-2222-2222-000000000003','11111111-1111-1111-1111-000000000012','55555555-5555-5555-5555-000000000008',current_date - 20, current_date - 15,2,'completed',34000,0,4600,2720,2500,43820,5100,133,3843900,13146,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000009','22222222-2222-2222-2222-000000000002','11111111-1111-1111-1111-000000000001','55555555-5555-5555-5555-000000000012',current_date - 12, current_date - 12,2,'completed',5600,0,0,448,0,6048,840,133,632520,6048,now(),now(),now()),
  ('66666666-6666-6666-6666-000000000010','22222222-2222-2222-2222-000000000005','11111111-1111-1111-1111-000000000007','55555555-5555-5555-5555-000000000020',current_date - 8, current_date - 8,2,'completed',4000,0,0,320,0,4320,600,133,452200,4320,now(),now(),now());

insert into public.reviews (booking_id, author_id, subject_id, direction, overall, sub_ratings, body, published_at) values
  ('66666666-6666-6666-6666-000000000001','22222222-2222-2222-2222-000000000001','11111111-1111-1111-1111-000000000001','trekker_to_guide',5,'{"safety":5,"communication":5,"local_knowledge":5,"english":5,"pace":5,"value":5}','Pemba made Base Camp feel safe and unhurried. He knew everyone in every teahouse. Cannot recommend him enough.',now() - interval '20 days'),
  ('66666666-6666-6666-6666-000000000002','22222222-2222-2222-2222-000000000002','11111111-1111-1111-1111-000000000003','trekker_to_guide',5,'{"safety":5,"communication":5,"local_knowledge":5,"english":4,"pace":5,"value":5}','Mingma watched our oxygen levels every morning. I never once felt at risk. A serious, kind professional.',now() - interval '40 days'),
  ('66666666-6666-6666-6666-000000000003','22222222-2222-2222-2222-000000000003','11111111-1111-1111-1111-000000000005','trekker_to_guide',5,'{"safety":5,"communication":4,"local_knowledge":5,"english":4,"pace":5,"value":4}','Gokyo Ri at sunrise with Lakpa was the highlight of my year. He timed everything perfectly.',now() - interval '18 days'),
  ('66666666-6666-6666-6666-000000000004','22222222-2222-2222-2222-000000000004','11111111-1111-1111-1111-000000000006','trekker_to_guide',4,'{"safety":5,"communication":4,"local_knowledge":5,"english":4,"pace":4,"value":4}','Tashi showed us corners of the Annapurna Circuit I would never have found. Lovely, patient guide.',now() - interval '30 days'),
  ('66666666-6666-6666-6666-000000000005','22222222-2222-2222-2222-000000000005','11111111-1111-1111-1111-000000000007','trekker_to_guide',5,'{"safety":5,"communication":5,"local_knowledge":5,"english":5,"pace":5,"value":5}','As a solo woman traveller I felt completely comfortable with Sunita. She is a wonderful guide and person.',now() - interval '12 days'),
  ('66666666-6666-6666-6666-000000000006','22222222-2222-2222-2222-000000000006','11111111-1111-1111-1111-000000000004','trekker_to_guide',5,'{"safety":5,"communication":4,"local_knowledge":5,"english":4,"pace":5,"value":5}','Nima''s connection to Langtang is something special. The yak cheese at Kyanjin is a must. Thank you Nima.',now() - interval '15 days'),
  ('66666666-6666-6666-6666-000000000007','22222222-2222-2222-2222-000000000001','11111111-1111-1111-1111-000000000008','trekker_to_guide',5,'{"safety":5,"communication":4,"local_knowledge":5,"english":4,"pace":5,"value":5}','Manaslu with Binod was raw and remote and unforgettable. He handled the restricted-area logistics flawlessly.',now() - interval '50 days'),
  ('66666666-6666-6666-6666-000000000008','22222222-2222-2222-2222-000000000003','11111111-1111-1111-1111-000000000012','trekker_to_guide',5,'{"safety":5,"communication":5,"local_knowledge":4,"english":5,"pace":5,"value":5}','Mardi Himal was our first trek and Raju made it joyful. Funny, encouraging, never made us feel slow.',now() - interval '14 days'),
  ('66666666-6666-6666-6666-000000000009','22222222-2222-2222-2222-000000000002','11111111-1111-1111-1111-000000000001','trekker_to_guide',5,'{"safety":5,"communication":5,"local_knowledge":5,"english":5,"pace":5,"value":5}','Did Pemba''s Kathmandu momo crawl on our last night. Five kinds of momo and a hundred stories. Perfect.',now() - interval '10 days'),
  ('66666666-6666-6666-6666-000000000010','22222222-2222-2222-2222-000000000005','11111111-1111-1111-1111-000000000007','trekker_to_guide',4,'{"safety":5,"communication":5,"local_knowledge":4,"english":5,"pace":4,"value":5}','Lovely calm sunrise yoga by the lake with Sunita to end the trip. Exactly what we needed.',now() - interval '7 days');

-- ============ M2 OPS DATA ============
-- Applicant guides awaiting verification (won't appear in public_guides).
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated',
       v.email, now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from (values
  ('11111111-1111-1111-1111-000000000013'::uuid,'gyaljen@example.com'),
  ('11111111-1111-1111-1111-000000000014'::uuid,'maya@example.com')
) as v(id, email);

insert into public.users (id, role, email, phone, full_name, country_code) values
  ('11111111-1111-1111-1111-000000000013','guide','gyaljen@example.com','+9779800000013','Gyaljen Sherpa','NP'),
  ('11111111-1111-1111-1111-000000000014','guide','maya@example.com','+9779800000014','Maya Tamang','NP');

insert into public.guides (user_id, slug, status, tier, licence_no, licence_expiry, home_district,
  years_experience, day_rate_usd_cents, hook_line, payout_method, payout_account, payout_account_name) values
  ('11111111-1111-1111-1111-000000000013','gyaljen-sherpa','applied',0,'TAAN-1013','2029-06-01','Solukhumbu',5,3000,'New applicant — Khumbu day hikes and EBC','esewa','98000ESW13','Gyaljen Sherpa'),
  ('11111111-1111-1111-1111-000000000014','maya-tamang','in_review',0,'TAAN-1014','2028-12-01','Rasuwa',4,2800,'New applicant — Langtang and Helambu','khalti','98000KHL14','Maya Tamang');

-- Verification checklists for the applicants (mix of pending/passed/failed).
insert into public.guide_verifications (guide_id, check_type, status, notes) values
  ('11111111-1111-1111-1111-000000000013','licence','pending',null),
  ('11111111-1111-1111-1111-000000000013','id_match','pending',null),
  ('11111111-1111-1111-1111-000000000013','phone','passed','OTP confirmed'),
  ('11111111-1111-1111-1111-000000000013','payout_account','pending',null),
  ('11111111-1111-1111-1111-000000000013','reference_1','pending',null),
  ('11111111-1111-1111-1111-000000000013','first_aid','pending',null),
  ('11111111-1111-1111-1111-000000000014','licence','passed','Licence verified against TAAN registry'),
  ('11111111-1111-1111-1111-000000000014','id_match','passed','Citizenship matches licence'),
  ('11111111-1111-1111-1111-000000000014','phone','passed','OTP confirmed'),
  ('11111111-1111-1111-1111-000000000014','payout_account','pending',null),
  ('11111111-1111-1111-1111-000000000014','reference_1','passed','Called; strong reference'),
  ('11111111-1111-1111-1111-000000000014','reference_2','pending',null),
  ('11111111-1111-1111-1111-000000000014','first_aid','failed','WFA cert expired — asked to renew');

-- Bookings spread across the pipeline so the kanban has a card in each column.
insert into public.bookings (id, trekker_id, guide_id, offering_id, start_date, end_date,
  party_size, status, guide_fee_usd_cents, permit_fees_usd_cents, service_fee_usd_cents,
  permit_handling_usd_cents, total_usd_cents, commission_usd_cents, fx_rate_npr,
  guide_payout_npr_paisa, deposit_usd_cents, deposit_paid_at, balance_paid_at) values
  ('66666666-6666-6666-6666-000000000011','22222222-2222-2222-2222-000000000004','11111111-1111-1111-1111-000000000001','55555555-5555-5555-5555-000000000001',current_date + 55, current_date + 69,1,'pending_deposit',63000,3800,5040,2500,74340,9450,133,7119150,22302,null,null),
  ('66666666-6666-6666-6666-000000000012','22222222-2222-2222-2222-000000000006','11111111-1111-1111-1111-000000000003','55555555-5555-5555-5555-000000000002',current_date + 40, current_date + 55,2,'deposit_paid',144000,7600,11520,2500,165620,21600,133,20390400,49686,now(),null),
  ('66666666-6666-6666-6666-000000000013','22222222-2222-2222-2222-000000000002','11111111-1111-1111-1111-000000000006','55555555-5555-5555-5555-000000000004',current_date + 30, current_date + 46,1,'docs_pending',56000,3800,4480,2500,66780,8400,133,7092800,20034,now(),null),
  ('66666666-6666-6666-6666-000000000014','22222222-2222-2222-2222-000000000001','11111111-1111-1111-1111-000000000005','55555555-5555-5555-5555-000000000003',current_date + 20, current_date + 32,2,'confirmed',96000,7600,7680,2500,113780,14400,133,10852800,113780,now(),now()),
  ('66666666-6666-6666-6666-000000000015','22222222-2222-2222-2222-000000000003','11111111-1111-1111-1111-000000000008','55555555-5555-5555-5555-000000000007',current_date - 3, current_date + 11,2,'active',89600,29200,7168,2500,128468,13440,133,10141760,128468,now(),now());

-- Permit applications for the confirmed + active treks (permit ids via route join).
insert into public.permit_applications (booking_id, permit_id, status, reference_no)
select '66666666-6666-6666-6666-000000000014', p.id, 'filed', 'SNP-2026-0148'
from public.permits p join public.offerings o on o.route_id = p.route_id
where o.id = '55555555-5555-5555-5555-000000000003';
insert into public.permit_applications (booking_id, permit_id, status, reference_no)
select '66666666-6666-6666-6666-000000000015', p.id, 'ready', 'MAN-2026-0072'
from public.permits p join public.offerings o on o.route_id = p.route_id
where o.id = '55555555-5555-5555-5555-000000000007';

-- Payable payouts for every completed booking (the payout ledger).
insert into public.payouts (guide_id, booking_id, amount_npr_paisa, method, status)
select b.guide_id, b.id, b.guide_payout_npr_paisa,
       coalesce(g.payout_method,'bank'), 'payable'
from public.bookings b join public.guides g on g.user_id = b.guide_id
where b.status = 'completed';

-- One open incident on the active trek.
insert into public.incidents (booking_id, severity, summary, status, opened_by, timeline) values
  ('66666666-6666-6666-6666-000000000015','L1','Trekker reported mild AMS at 4,300m; guide descended 300m and monitoring.','monitoring',
   '33333333-3333-3333-3333-000000000001',
   '[{"at":"day 3","actor":"guide","action":"Reported mild AMS, descended to Samdo"}]'::jsonb);

-- Dev-only: give the ops console a working local login. Seed data is stripped
-- before production (M9); only this ops account is loginable.
--   email: ops@example.com   password: opsdevpass123
update auth.users
  set encrypted_password = extensions.crypt('opsdevpass123', extensions.gen_salt('bf'))
  where id = '33333333-3333-3333-3333-000000000001';

-- ============ M5 GUIDE DASHBOARD DATA (Pemba = guide 001) ============
-- Open enquiries awaiting Pemba's accept/decline.
insert into public.enquiries (id, trekker_id, guide_id, offering_id, start_date, party_size, message, status, expires_at) values
  ('77777777-7777-7777-7777-000000000001','22222222-2222-2222-2222-000000000004','11111111-1111-1111-1111-000000000001','55555555-5555-5555-5555-000000000001',current_date + 62, 2,'Hi Pemba! My partner and I would love to do EBC with you in November. Are these dates open?','open', now() + interval '20 hours'),
  ('77777777-7777-7777-7777-000000000002','22222222-2222-2222-2222-000000000003','11111111-1111-1111-1111-000000000001','55555555-5555-5555-5555-000000000012',current_date + 5, 3,'Are you free for the Kathmandu momo crawl this week? Three of us.','open', now() + interval '10 hours'),
  ('77777777-7777-7777-7777-000000000003','22222222-2222-2222-2222-000000000005','11111111-1111-1111-1111-000000000001','55555555-5555-5555-5555-000000000001',current_date + 90, 1,'Solo trekker, first time at altitude — is EBC realistic for me?','open', now() + interval '23 hours');

-- An active trek for Pemba so the dashboard shows the check-in button today.
insert into public.bookings (id, trekker_id, guide_id, offering_id, start_date, end_date,
  party_size, status, guide_fee_usd_cents, permit_fees_usd_cents, service_fee_usd_cents,
  permit_handling_usd_cents, total_usd_cents, commission_usd_cents, fx_rate_npr,
  guide_payout_npr_paisa, deposit_usd_cents, deposit_paid_at, balance_paid_at) values
  ('66666666-6666-6666-6666-000000000016','22222222-2222-2222-2222-000000000002','11111111-1111-1111-1111-000000000001','55555555-5555-5555-5555-000000000001',current_date - 4, current_date + 10,2,'active',126000,3800,10080,2500,142380,18900,133,14231700,142380,now(),now());

-- ============ M-CONTRACTS: default active contract template ============
insert into public.contract_templates (title, body, version, active) values
  ('Guide Engagement Agreement',
   $tpl$# Guide Engagement Agreement

This agreement is made on {{signed_date}} between **{{company_name}}** ("the Company") and **{{guide_name}}** ("the Guide").

## Engagement
The Guide agrees to lead the trek **{{offering_title}}** from **{{start_date}}** to **{{end_date}}** for a party of **{{party_size}}**.

## Compensation
- Guide fee: **{{guide_fee}}**
- Platform commission: {{commission}}
- Guide payout (NPR): **{{guide_payout_npr}}**

The Company remits the payout above per its published payout schedule after the trek completes.

## Guide undertakings
The Guide holds a valid, current trekking licence, will conduct the trek professionally and safely, will follow the Company's safety and conduct standards, and will keep the trekker informed at agreed check-in points.

## Safety
The rescue-flight pledge applies: the Company takes **no margin** on emergency evacuations. The Guide will prioritise trekker safety over schedule at all times.

## Signatures
Accepted by the Guide on {{signed_date}} (acceptance of the booking constitutes signature).
Counter-signed by {{company_name}} on {{signed_date}}.
$tpl$,
   1, true);

-- ============ v3: experience price breakdowns (treks) ============
update public.offerings o set price_breakdown = jsonb_build_object(
    'guide_fee_total_usd_cents', coalesce(g.day_rate_usd_cents, 4500) * o.days,
    'permits_usd_cents', 9200,
    'porters_usd_cents', case when o.days >= 7 then 8400 else 3000 end,
    'logistics_usd_cents', o.days * 1500,
    'trek_pct', 0.10,
    'fund_pct', 0.03)
  from public.guides g
  where g.user_id = o.guide_id and o.kind = 'trek';

-- ============ v3 §12: backup guide on every trek (round-robin, never self) ============
with verified as (
  select user_id, row_number() over (order by user_id) as rn, count(*) over () as n
  from public.guides where status = 'verified'
),
leads as (
  select o.id as offering_id, v.rn
  from public.offerings o join verified v on v.user_id = o.guide_id
  where o.kind = 'trek'
)
update public.offerings o
set backup_guide_id = pick.user_id
from leads l
join verified pick on pick.rn = (l.rn % (select max(n) from verified)) + 1
where o.id = l.offering_id;

-- ============ Phase 3: verification receipt dates + porter-welfare pledge ============
update public.guide_verifications gv set status='passed'
  from public.guides g
  where g.user_id=gv.guide_id and g.status='verified'
    and gv.check_type in ('licence','id_match','phone','reference_1');
update public.guide_verifications gv
  set verified_at = g.created_at + interval '3 days',
      expires_at = case when gv.check_type in ('licence','first_aid')
                        then (g.created_at + interval '3 days' + interval '2 years') end
  from public.guides g
  where g.user_id=gv.guide_id and g.status='verified' and gv.status='passed' and gv.verified_at is null;
update public.guides set porter_welfare = true where status='verified' and tier >= 2;
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

-- ============ Phase 7: recaps for completed treks (the /stories gallery) ============
insert into public.recaps (booking_id, slug, photo_urls, stats)
select b.id,
       o.slug || '-' || substr(b.id::text, 1, 8),
       coalesce((select array_agg(url) from (
         select url from public.offering_photos where approved limit 6) x), '{}'),
       jsonb_build_object('days', (b.end_date - b.start_date) + 1, 'max_altitude_m', r.max_altitude_m)
from public.bookings b
join public.offerings o on o.id = b.offering_id
left join public.routes r on r.id = o.route_id
where b.status = 'completed' and o.kind = 'trek'
  and not exists (select 1 from public.recaps rc where rc.booking_id = b.id);
-- Real photography (anti-AI pass): swap placeholder URLs for real images.
update public.users u set avatar_url = '/img/guides/' || g.slug || '.jpg'
from public.guides g where g.user_id = u.id and g.status = 'verified';

update public.offerings o set cover_photo_url = '/img/routes/' || r.slug || '.jpg'
from public.routes r where r.id = o.route_id and o.kind = 'trek';

update public.offerings o set cover_photo_url = '/img/exp/' || o.slug || '.jpg'
where o.kind <> 'trek';

update public.guide_photos gp set url = '/img/guides/' || g.slug || '.jpg'
from public.guides g where g.user_id = gp.guide_id and gp.kind = 'headshot';

update public.guide_photos gp set url = coalesce(
  (select o.cover_photo_url from public.offerings o
   where o.guide_id = gp.guide_id and o.cover_photo_url like '/img/%' limit 1),
  '/img/hero.jpg')
where gp.kind <> 'headshot';

update public.offering_photos op set url = o.cover_photo_url
from public.offerings o where o.id = op.offering_id;

update public.recaps rc set photo_urls = (
  select array_remove(array[o.cover_photo_url, '/img/hero.jpg'], null)
  from public.bookings b join public.offerings o on o.id = b.offering_id
  where b.id = rc.booking_id);
