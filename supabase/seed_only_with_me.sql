-- ============ only_with_me — the promise, in the guide's own words ============
-- One concrete thing you get with this guide and with nobody else. First
-- person, under twelve words, no marketing adjectives.
--
-- These are deliberately written as a Nepali guide with good-but-second-
-- language English would write them: dropped articles, short sentences,
-- "Always worth." Do not "fix" them. The whole positioning is that you are
-- booking a person, and a person does not write like a brochure.
--
-- Runs after the guide seeds (see sql_paths in config.toml). Idempotent —
-- only fills the column where it is still null, so a guide who has since
-- rewritten their own line keeps it.

create table if not exists _seed_owm (slug text primary key, line text);
truncate _seed_owm;

insert into _seed_owm values
  ('pemba-sherpa',        'I know which teahouse at Lobuche has hot water.'),
  ('dawa-sherpa',         'We walk two hours less each day. Nobody gets sick.'),
  ('mingma-sherpa',       'I check your oxygen every night and write it down.'),
  ('nima-tamang',         'I show you where my village was before 2015.'),
  ('lakpa-sherpa',        'I wake you at four for Gokyo Ri. Always worth.'),
  ('tashi-gurung',        'You sleep at my family house in Ghandruk, not teahouse.'),
  ('sunita-gurung',       'I share a room with you if you come alone.'),
  ('binod-tamang',        'I cook you Tamang bread at Samagaon on rest day.'),
  ('karma-bhote',         'Six days we see nobody. I promise this.'),
  ('phurba-sherpa',       'I tell you three months early if you are not ready.'),
  ('anjali-rai',          'I know where the red rhododendron opens first in March.'),
  ('raju-magar',          'I carry your bag the day you cry. No charge.'),

  ('ang-dorje-sherpa',    'I walk porter speed, so you reach Namche fresh.'),
  ('chhiring-sherpa',     'I shoot your trek properly — 200 edited photos after.'),
  ('nawang-sherpa',       'My aunty runs a lodge in Namche. You get a room.'),
  ('pasang-lhamu-sherpa', 'I add one night at Dingboche even when you feel fine.'),
  ('dolma-sherpa',        'I choose every lodge kitchen myself. I have seen them.'),
  ('tenzing-bhote',       'I tell you honestly how far the helicopter is.'),
  ('kami-rita-tamang',    'I walked out of Langtang in 2015. I read the slopes.'),
  ('sanu-maya-tamang',    'I was a nurse. I carry real medicine, not aspirin.'),
  ('buddhi-tamang',       'I stop for tea with people you would walk past.'),
  ('maya-gurung',         'I write down every rupee we spend and show you.'),
  ('prakash-gurung',      'I take the path above Dhampus that is on no map.'),
  ('bishnu-gurung',       'We stay off the jeep road eleven days of sixteen.'),
  ('sarita-gurung',       'If you come alone, I sleep in your room.'),
  ('dil-bahadur-gurung',  'You rest two nights in my own village at 3,500m.'),
  ('krishna-thapa',       'I stand in the Immigration queue myself for your permit.'),
  ('ramesh-thapa',        'I cook the dal myself when the lodge is lazy.'),
  ('sabina-thapa',        'You can call me at eleven at night. I answer.'),
  ('hari-poudel',         'I bring binoculars. We find forty birds if weather good.'),
  ('suman-shrestha',      'I read the Tibetan on the mani walls for you.'),
  ('nisha-shrestha',      'I teach you the pottery wheel in my own town.'),
  ('rajendra-shrestha',   'I write your kit list by hand before you fly.'),
  ('deepak-rai',          'I never rush. Fourteen days is normal walking for me.'),
  ('sumitra-rai',         'I take you up Kyanjin Ri at dawn, roped if needed.'),
  ('bikash-limbu',        'I find the way where there is no sign at all.'),
  ('chandra-limbu',       'I carry my family tea from Ilam and make it.'),
  ('sonam-lama',          'I take you inside the monastery where I studied.'),
  ('pema-lama',           'I speak Dolpa language. The old women talk to me.'),
  ('tsering-gyalpo',      'I show you the winter road to Lo Manthang.'),
  ('yangzom-gurung',      'I speak to the grandmother. Then the kitchen door opens.'),
  ('naresh-magar',        'I was a Gurkha. Your bag is dry when it rains.'),
  ('kalpana-magar',       'I explain altitude like class four. Nobody feels stupid.'),
  ('til-bahadur-pun',     'The lodges are full, but not for me. Eighteen years.'),
  ('jeevan-bhattarai',    'I taught English ten years. You understand every word.'),
  ('manoj-adhikari',      'I missed one flight in twelve years. Not yours.'),
  ('ganesh-chaudhary',    'I learned these hills as adult. I remember what is hard.'),
  ('aakash-karki',        'I charge less because I am new. I work harder.');

update public.guides g set only_with_me = s.line
from _seed_owm s where s.slug = g.slug and g.only_with_me is null;

drop table _seed_owm;
