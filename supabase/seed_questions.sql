-- Ask-me-anything walls for the demo guides.
--
-- Written as the questions trekkers actually open a message thread with —
-- money, altitude, fear, and what happens when something goes wrong — and
-- answered in second-language English, because that is what the real ones
-- will sound like and the page has to be designed for it.

create table if not exists _seed_questions (
  guide_slug text, asker text, country text, body text, answer text, helpful int, age_days int
);
truncate _seed_questions;

insert into _seed_questions values
('pemba-sherpa', 'Marta', 'PL',
 'I am 58 and not a fast walker. Is Everest Base Camp realistic for me, honestly?',
 'Yes, if you take the days. Fast walking is not the thing that gets people to Base Camp — sleeping low enough is. I put one more night in Namche and one more in Dingboche for anybody over fifty, and then the pace does not matter. The people who turn back are usually the young ones who went too high too quickly.',
 14, 40),

('pemba-sherpa', 'Tom', 'AU',
 'What do you carry for altitude sickness, and when do you decide to turn someone around?',
 'I carry a pulse oximeter, Diamox, and a bottle of oxygen from Dingboche upward. The decision is not one number. If somebody cannot eat, cannot sleep, and their oxygen is still falling after a rest day, we go down that morning. I have taken four people down in eleven years and every one of them was angry with me for about six hours.',
 22, 33),

('pemba-sherpa', 'Ines', 'DE',
 'What is one thing everybody packs that they do not need?',
 'A big sleeping bag. Every teahouse has blankets and the rooms are not as cold as people think below Lobuche. Bring a liner and one warm layer for the room. The weight you save is a real thing on day eight.',
 9, 21),

('lakpa-sherpa', 'Wei', 'SG',
 'How many times have you actually walked the Gokyo route?',
 'Thirty-one times with guests, and I grew up two valleys from it. The lakes I have seen frozen and I have seen them completely blue in the same month of different years, so I do not promise weather to anybody.',
 11, 28),

('lakpa-sherpa', 'Sophie', 'FR',
 'I am travelling alone as a woman. What does that actually look like on the trail with you?',
 'You get your own room in every teahouse, I book it ahead, and it is in the price I quoted you. I walk behind you not in front, because in front means you are chasing somebody. If you want to stop and take photographs for twenty minutes we stop. Four of my last ten guests were women walking alone.',
 27, 17),

('dawa-sherpa', 'Ben', 'GB',
 'What happens to my money if I get sick before the trek and have to cancel?',
 'The office handles that part and the rule is written on your booking page before you pay, not after. What I will say from my side: I do not keep a deposit from somebody who is ill. It has happened twice and both times I asked them to come back in a different season, and both times they did.',
 18, 12),

('dawa-sherpa', 'Hanna', 'FI',
 'Is there anywhere on the Manaslu circuit with a phone signal?',
 'Ncell works in Jagat, and in Samagaon on a good day if you stand behind the gompa. Between Samdo and Bimthang there is nothing for two days. Tell your family that before you leave, so they are not worried on the exact days you cannot answer.',
 15, 8),

('nima-tamang', 'Ravi', 'IN',
 'Do you actually pay your porters properly, or is that just something on the website?',
 'They get 1,800 rupees a day, their own room and the same food I eat, and their load is weighed in front of them at the start. I was a porter for four years. The thing that is worth writing down is the weighing — that is where it goes wrong for most porters, not the money.',
 31, 5);

insert into public.guide_questions
  (guide_id, asker_name, asker_country, asker_email, body, answer, status, answered_at, helpful_count, created_at)
select
  g.user_id, s.asker, s.country,
  lower(s.asker) || '@example.com',
  s.body, s.answer, 'answered',
  now() - make_interval(days => s.age_days - 2),
  s.helpful,
  now() - make_interval(days => s.age_days)
from _seed_questions s
join public.guides g on g.slug = s.guide_slug
where not exists (
  select 1 from public.guide_questions q
  where q.guide_id = g.user_id and q.body = s.body
);

-- One waiting question so the guide dashboard has something to answer in a
-- demo, and the "waiting on you" state is not only visible in a screenshot.
insert into public.guide_questions (guide_id, asker_name, asker_country, asker_email, body)
select g.user_id, 'Jonas', 'NO', 'jonas@example.com',
  'How cold does it get at night at Base Camp in November, in real numbers?'
from public.guides g
where g.slug = 'pemba-sherpa'
  and not exists (
    select 1 from public.guide_questions q
    where q.guide_id = g.user_id and q.status = 'pending'
  );

drop table _seed_questions;
