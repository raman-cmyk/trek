-- 0089 (was 0067 on claude/new-session-vereu4) — fill in what we already know, and demo data for the rest.
--
-- 0066 added the columns; every row arrived empty, so the new rows on a trip
-- page and a card would render as nothing at all. Two kinds of fill here, kept
-- apart deliberately:
--
--   1. FACTS WE ALREADY HOLD. A trek, a day hike, a city walk and a food walk
--      are walked — that is what they are — so `transport` gets 'walking'.
--      Difficulty comes off the route the trek runs, which the office already
--      graded in `routes.difficulty`; 'hard' there is 'challenging' here.
--      Nothing is invented: an adventure trip (rafting, paragliding) is left
--      empty rather than guessed at.
--
--   2. DEMO CONTENT, for the seed guides only. FAQs, accessibility and the
--      Lukla flight are written per trip below so the founder can see every
--      section of the page populated. A real guide overwrites these from their
--      own form; they exist because an empty FAQ block teaches nobody whether
--      the FAQ block works.
--
-- Both are `where` -guarded on emptiness, so re-running this never overwrites
-- something a guide has since typed.

-- 1 — how you move, where it is definitional
update offerings
set transport = array['walking']
where transport = '{}'
  and kind in ('trek','day_hike','city','food_culture');

-- 1 — how hard it is, from the route grading the office already did
update offerings o
set activity_level = case r.difficulty
    when 'easy' then 'easy'
    when 'moderate' then 'moderate'
    when 'hard' then 'challenging'
    when 'strenuous' then 'strenuous'
  end
from routes r
where r.id = o.route_id
  and o.activity_level is null
  and r.difficulty in ('easy','moderate','hard','strenuous');

-- 1 — a day out with no route to grade: a walk around a city is easy, a day
-- hike is not, and neither is a guess about anybody's knees.
update offerings set activity_level = 'easy'
where activity_level is null and kind in ('city','food_culture');
update offerings set activity_level = 'moderate'
where activity_level is null and kind = 'day_hike';

-- 2 — demo: the Everest treks fly to Lukla, which is the fact a first-timer
-- most wants and the one nobody puts on the page.
update offerings o
set transport = array['domestic_flight','walking'],
    transport_note = 'Kathmandu to Lukla by light aircraft, then on foot. The flight is in your price; in bad weather we wait, or drive to Ramechhap and fly from there.'
from routes r
where r.id = o.route_id
  and r.region in ('Khumbu','Solukhumbu')
  and o.kind = 'trek'
  and o.transport_note is null;

-- 2 — demo: who each kind of trip suits, said as a welcome and as a caution.
update offerings set accessibility = array['kid_friendly','stroller','service_animals']
where accessibility = '{}' and kind in ('city','food_culture');

update offerings set accessibility = array['kid_friendly']
where accessibility = '{}' and kind = 'day_hike';

update offerings
set accessibility = array['not_for_limited_mobility','altitude_health'],
    accessibility_note = 'Teahouse floors and trails are uneven, and there is no vehicle access once we start walking. Tell your guide about any heart, lung or altitude history before you book — it changes the plan, not the answer.'
where accessibility = '{}' and kind = 'trek';

-- 2 — demo: the questions the office answers by email every week.
update offerings
set faqs = jsonb_build_array(
  jsonb_build_object(
    'q', 'Is this trip really just me and my guide?',
    'a', 'Yes. Every trip here is private to the party that books it. Nobody is added to your group, and your guide walks with you, not with three other bookings.'
  ),
  jsonb_build_object(
    'q', 'What if I need to cancel?',
    'a', 'Cancel 30 days or more before and you get everything except the card fee back. Between 15 and 29 days it is half, 7 to 14 days a quarter, and inside a week nothing — by then your guide has turned other work away. If your guide cancels, or we call it off for weather or safety, you get everything back.'
  ),
  jsonb_build_object(
    'q', 'Can I change the plan once we have started?',
    'a', 'Within reason, yes — this is one guide and one party, so a slower morning or an extra night somewhere you like is a conversation, not a change fee. Anything that adds a day or a permit gets repriced and agreed first.'
  ),
  jsonb_build_object(
    'q', 'How fit do I need to be?',
    'a', 'See the activity level on this page. If you are unsure, message your guide before you pay anything — they would rather tell you honestly than have you turn back on day three.'
  )
)
where jsonb_array_length(faqs) = 0 and kind = 'trek';

update offerings
set faqs = jsonb_build_array(
  jsonb_build_object(
    'q', 'Is this trip really just me and my guide?',
    'a', 'Yes. Every experience here is private to the party that books it — no strangers join you.'
  ),
  jsonb_build_object(
    'q', 'What happens if it rains?',
    'a', 'We go anyway unless it is unsafe, and your guide changes the order so you are inside when the worst of it passes. If it has to be called off you get everything back.'
  ),
  jsonb_build_object(
    'q', 'Is food included?',
    'a', 'Check the "What is included" list on this page — it says exactly what your price covers and what it does not.'
  )
)
where jsonb_array_length(faqs) = 0 and kind in ('day_hike','city','food_culture','adventure');
