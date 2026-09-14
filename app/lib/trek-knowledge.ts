/**
 * The fifty questions a person has before they fly.
 *
 * Put our route page beside nepalhightrek.com or trekthehimalayas.com and the
 * gap is not design, it is this: they answer where you sleep, whether there is
 * a shower, what charging a phone costs at 4,000 m, how much a helicopter is
 * if it goes wrong, what a porter is allowed to carry. We answered almost none
 * of it.
 *
 * Their version of this content is copy-pasted onto every trek page, which is
 * why theirs drifts — the same site will tell you a permit costs two different
 * amounts on two pages. Ours is written once, here, and parameterised by the
 * route's own altitude, permits and season. Correct it in this file and it is
 * correct on all twenty-four pages.
 *
 * What belongs HERE: anything true of trekking in Nepal generally, which
 * changes only with how high you go. What belongs in the DATABASE (0076,
 * editable by ops without a deploy): anything true of one walk — how you get
 * to the trailhead, what the lodges are like on that trail, the highlights.
 *
 * Written in the house voice: plain, specific, and honest about what varies.
 * Where a number moves — and most of them do, with season and with altitude —
 * it is given as a range and said to be one. Nothing here is a promise; the
 * promises are in the price breakdown.
 */

export interface RouteFacts {
  name: string;
  region: string;
  maxAltitudeM: number | null;
  days: number | null;
  permits: Array<{ name: string; usdCents: number }>;
}

export interface KnowSection {
  id: string;
  title: string;
  /** A glyph name from the design system. */
  glyph: string;
  /** Paragraphs. */
  body: string[];
  bullets?: string[];
}

export type AltitudeBand = "low" | "high" | "very-high" | "extreme";

/**
 * How high is high.
 *
 * The bands are the ones altitude medicine actually uses, and they decide
 * most of what this file says: under 3,000 m almost nothing on this page
 * matters, and over 5,000 m all of it does.
 */
export function altitudeBand(m: number | null | undefined): AltitudeBand {
  const h = Number(m ?? 0);
  if (h >= 5000) return "extreme";
  if (h >= 4000) return "very-high";
  if (h >= 3000) return "high";
  return "low";
}

/** A restricted area: a permit you cannot buy alone, and a guide you must have. */
export function isRestricted(permits: RouteFacts["permits"]): boolean {
  return (permits ?? []).some((p) => /restricted/i.test(p.name ?? ""));
}

/** Every permit added up, per person. The number people search for. */
export function permitTotalUsdCents(permits: RouteFacts["permits"]): number {
  return (permits ?? []).reduce((sum, p) => sum + (Number(p.usdCents) || 0), 0);
}

const usd = (cents: number) => `$${Math.round(cents / 100)}`;
const metres = (m: number) => `${m.toLocaleString("en-US")} m`;

/**
 * The practical sections, in the order somebody worries about them.
 *
 * Altitude first, because it is the one that can actually hurt you, and money
 * and power late, because they are the ones people look up the night before.
 */
export function knowBeforeYouGo(route: RouteFacts): KnowSection[] {
  const band = altitudeBand(route.maxAltitudeM);
  const top = route.maxAltitudeM ? metres(route.maxAltitudeM) : "the top of this route";
  const restricted = isRestricted(route.permits);
  const out: KnowSection[] = [];

  // ── Altitude ───────────────────────────────────────────────────────────
  if (band === "low") {
    out.push({
      id: "altitude",
      title: "Altitude",
      glyph: "altitude",
      body: [
        `${route.name} tops out at ${top}, which is below the height at which altitude sickness normally starts. You may notice you are breathing harder on the climbs. That is all it usually is.`,
        "If you have a headache that painkillers do not touch, feel sick, or cannot sleep, tell your guide anyway. It is easier to deal with early and there is no prize for being stoic.",
      ],
    });
  } else {
    out.push({
      id: "altitude",
      title: "Altitude, and how we manage it",
      glyph: "altitude",
      body: [
        `${route.name} reaches ${top}. Above about 2,500 m most people feel something — shortness of breath, a light headache, broken sleep, no appetite. That is normal and it passes as you acclimatise.`,
        "What is not normal is a headache that will not shift, vomiting, losing your balance, or breathlessness while sitting still. Those are the two dangerous kinds of altitude sickness, and the treatment for both is to go down. Not tomorrow — then.",
        "Your guide watches for this every day. It is most of what they are trained for, and it is the single biggest reason not to do this walk alone.",
      ],
      bullets: [
        "The rule of thumb above 3,000 m: sleep no more than 300–500 m higher than the night before, and take a rest day roughly every 1,000 m.",
        "Rest days are not spare days. Walking high and sleeping low is what makes them work, so your guide will take you up a side hill and bring you back down.",
        "Drink more than you want to. Three to four litres a day.",
        "Acetazolamide (Diamox) helps you acclimatise and is worth asking your doctor about before you fly. It is not a licence to go up faster.",
        "Alcohol and sleeping pills both make it worse. Leave them until you are down.",
      ],
    });
  }

  // ── Insurance ──────────────────────────────────────────────────────────
  out.push({
    id: "insurance",
    title: "Insurance you actually need",
    glyph: "check",
    body: [
      `Travel insurance is not optional on this trek, and an ordinary policy is not enough. It has to say two things: that it covers trekking to at least ${top}, and that it covers helicopter evacuation and repatriation.`,
      band === "low"
        ? "Plenty of standard policies cover walking at this height. Read the altitude limit anyway — some stop at 2,500 m, which this trek passes."
        : "A lot of policies stop at 3,000 m or 4,000 m, and a lot of them exclude helicopter rescue entirely. Both of those are the ones that matter here.",
      "Send us a copy before you fly. We keep it with your booking so that if the office has to call your insurer at six in the morning, we are not hunting for a policy number.",
    ],
  });

  // ── Getting rescued ────────────────────────────────────────────────────
  if (band !== "low") {
    out.push({
      id: "rescue",
      title: "If it goes wrong",
      glyph: "spark",
      body: [
        "Serious altitude sickness, a bad fall, an infection that will not wait: the answer is a helicopter to Kathmandu. It is a good system and it works, and a flight from the high Khumbu or Manang typically runs somewhere around $3,000–6,000 depending on where you are lifted from.",
        "Almost nobody pays that themselves. The insurer does — but many will only launch once they have confirmed cover, which is why the policy copy matters and why your guide carries the office number.",
        "Our office in Kathmandu watches every trek that is on the trail, every day. Your guide sends a check-in each evening, and when one does not arrive we start making calls.",
      ],
    });
  }

  // ── Permits ────────────────────────────────────────────────────────────
  const permitBullets = (route.permits ?? []).map(
    (p) => `${p.name} — ${p.usdCents ? usd(p.usdCents) : "price varies"} per person`,
  );
  out.push({
    id: "permits",
    title: "Permits, and who gets them",
    glyph: "route",
    body: [
      route.permits?.length
        ? `This route needs ${route.permits.length === 1 ? "one permit" : `${route.permits.length} permits`}, ${usd(permitTotalUsdCents(route.permits))} per person in total. They are in the price you are quoted — not an extra at the airport.`
        : "The permits for this route are in the price you are quoted, not an extra at the airport. The exact set depends on the season and where you start; the office confirms them when you book.",
      restricted
        ? "This is a restricted area. The permit cannot be issued to an individual — it goes through a registered trekking agency, and the rules require a licensed guide and normally a minimum of two trekkers on one permit. We file it for you."
        : "We file them for you and carry the paperwork. You will be asked for your passport and a couple of photographs, and your guide shows the permits at each checkpost.",
      "Since 2023 a licensed guide has been required for foreign trekkers across Nepal's national parks and conservation areas. Every guide here holds a current licence — that is what the verification badge on their profile means.",
    ],
    bullets: permitBullets.length ? permitBullets : undefined,
  });

  // ── Where you sleep ────────────────────────────────────────────────────
  out.push({
    id: "sleeping",
    title: "Where you sleep",
    glyph: "tent",
    body: [
      "Teahouses: family-run lodges, a twin room with plywood walls, a bed with a foam mattress and a blanket. The dining room has a stove and it is where everyone sits in the evening, because it is the only heated room in the building.",
      band === "extreme" || band === "very-high"
        ? "Lower down the rooms are comfortable and some have an attached bathroom. Higher up they get simpler — shared squat toilets, no heating in the rooms, and at the highest stops you may be in a dormitory on a busy night. This is normal and it is the same for everybody on the trail."
        : "Rooms on this route are mostly comfortable, and some have their own bathroom.",
      "Bring a sleeping bag. The blankets are real but they are not always enough, and a bag of your own is warmer and cleaner.",
    ],
    bullets: [
      "A hot shower is usually $3–6 and gets dearer and less reliable the higher you go. Gas or solar; on a cloudy day, solar means cold.",
      "Rooms are cheap because lodges make their money on food. Eating where you sleep is the deal, and it is not one to try to get out of.",
      "In high season the busiest stops fill up. Your guide walks ahead or rings ahead to hold rooms — one of the quiet things a guide is for.",
    ],
  });

  // ── Food ───────────────────────────────────────────────────────────────
  out.push({
    id: "food",
    title: "Food and water",
    glyph: "spark",
    body: [
      "Every teahouse has much the same menu, at a price set by the local lodge committee and printed on the wall: dal bhat, fried rice, noodles, potatoes, soup, eggs, porridge, and a lot of variations on those. Prices climb with the altitude, because everything on the menu walked up.",
      "Dal bhat is the one to order. Rice, lentil soup, vegetable curry, pickle — and the refills are free, everywhere, always. It is what your guide and your porter will eat twice a day, and there is a reason for that.",
      band === "low"
        ? "Eat what you like. The kitchens on this route are used to visitors."
        : "Above about 3,000 m, go vegetarian. Meat at that height has been carried up unrefrigerated for a day or two, and the stomach bug it can give you is miserable at altitude and dangerous if it dehydrates you.",
    ],
    bullets: [
      "Never drink untreated water. Teahouses sell boiled water by the litre, and it gets more expensive higher up.",
      "Bring a filter, a SteriPen or purification tablets — they pay for themselves in a few days and save a lot of plastic.",
      "Single-use plastic bottles are banned in parts of the Khumbu and discouraged across the conservation areas. Carry a refillable bottle.",
      "Bring the snacks you actually like from home. What is for sale on the trail is expensive and it is all the same.",
    ],
  });

  // ── Money ──────────────────────────────────────────────────────────────
  out.push({
    id: "money",
    title: "Money on the trail",
    glyph: "check",
    body: [
      "Everything above the road is cash, in Nepali rupees. There are a few ATMs on the busiest trails and they are not to be relied on — they run out, they go offline, and the nearest working one can be several days behind you.",
      "Draw what you need in Kathmandu or Pokhara before you go, and carry it in small notes. Nobody at 4,000 m can change a 1,000-rupee note at breakfast.",
      "Budget roughly $15–25 a day per person for the things that are not in your trip price: hot showers, charging, wifi, boiled water, a beer at the bottom, snacks.",
    ],
  });

  // ── Power and signal ───────────────────────────────────────────────────
  out.push({
    id: "power",
    title: "Charging, phone signal and wifi",
    glyph: "spark",
    body: [
      "Lodges run on micro-hydro or solar and sell charging by the device or by the hour — usually $2–5, more at the top. In the high season, in the evening, there is a queue.",
      "Bring a power bank of 10,000–20,000 mAh and keep it in your sleeping bag overnight. Cold flattens a battery faster than use does.",
      "Nepali mobile coverage on the popular trails is better than people expect and patchy everywhere else. An Ncell or NTC SIM costs a few dollars in Kathmandu and is worth having. Lodges sell wifi cards for a few dollars a day; the speed depends on the weather.",
      "Tell the people at home that you will be out of touch for stretches. It is normal, it is not a sign of trouble, and your guide is checking in with our office whether or not you have a signal.",
    ],
  });

  // ── Porters ────────────────────────────────────────────────────────────
  out.push({
    id: "porters",
    title: "What your porter carries",
    glyph: "people",
    body: [
      "One porter normally carries for two trekkers — a duffel each, around 10–12 kg per person, and never more than 20 kg in total. That limit is the platform's, in writing, and it is weighed at the start rather than guessed at.",
      "You carry a daypack: water, a layer, camera, whatever you want during the day.",
      "Every porter on a trip booked here is insured, has boots and a jacket that fit, and sleeps and eats in the lodge rather than the kitchen floor. That is the porter-welfare pledge, and a guide who breaks it does not stay on this platform.",
    ],
  });

  // ── Tipping ────────────────────────────────────────────────────────────
  out.push({
    id: "tipping",
    title: "Tipping, honestly",
    glyph: "star",
    body: [
      "Tipping is customary at the end of a trek and it is genuinely not compulsory. Your guide is paid a real day rate that they set themselves and keep in full — the tip is a bonus on top of a fair wage, not the wage itself, which is not true everywhere in Nepal.",
      "If you want a number: a common range is around $8–12 a day for a guide and $5–8 a day for a porter, from the group rather than from each person, given on the last day. Spend less, spend more, or give nothing — none of it changes how you are looked after.",
    ],
  });

  // ── Culture ────────────────────────────────────────────────────────────
  out.push({
    id: "culture",
    title: "Walking through somebody's home",
    glyph: "pin",
    body: [
      `The trail through ${route.region} is not a park. It is the road between villages, and it has been for centuries. People are using it to get to school and to move animals.`,
      "Ask before you photograph somebody, and accept no. Take your shoes off in a monastery, do not point your feet at an altar, and give a small donation if you go in.",
    ],
    bullets: [
      "Pass mani walls, chortens and prayer wheels with them on your right — clockwise. Everybody local does, and it costs you three steps.",
      "When a yak or mule train comes through, step to the inside of the trail, the mountain side. Animals take the outside, and they do not check whether you are still on it.",
      "Uphill walkers have right of way. They are working harder than you are.",
      "A little Nepali goes a long way. Namaste, and dhanyabaad for thank you.",
    ],
  });

  // ── Leave it as you found it ───────────────────────────────────────────
  out.push({
    id: "responsible",
    title: "Leaving it as you found it",
    glyph: "tree",
    body: [
      "Everything that goes up has to come down, and on most of these trails it comes down on somebody's back. Carry your own rubbish out to the roadhead rather than leaving it for a lodge that has no way to dispose of it.",
      "Stay on the trail. The shortcut across a switchback is what starts the erosion scar you can see from the valley floor.",
    ],
  });

  return out;
}

export interface PackGroup {
  id: string;
  title: string;
  glyph: string;
  /** Each line: the thing, and why, when the why is not obvious. */
  items: string[];
  note?: string;
}

/**
 * What to bring, for this height of walk.
 *
 * A packing list is the single most-printed page on any trekking site, and we
 * did not have one. The list changes with altitude, so it is generated rather
 * than written: a five-day walk at 3,200 m does not need the down jacket a
 * fortnight at 5,500 m does, and telling somebody to buy one is telling them
 * to waste £300.
 *
 * Anything the route itself needs — crampons for an icy pass, a four-season
 * bag for a camping route — comes from `routes.packing_extra` and is appended
 * by the caller.
 */
export function packingList(route: RouteFacts): PackGroup[] {
  const band = altitudeBand(route.maxAltitudeM);
  const cold = band === "extreme" || band === "very-high";
  const long = (route.days ?? 0) >= 10;

  return [
    {
      id: "layers",
      title: "What you wear",
      glyph: "walk",
      items: [
        "Two base layers, merino or synthetic. Not cotton — it holds sweat and then holds cold.",
        "A fleece or light down mid-layer.",
        cold
          ? "A proper down jacket. You will want it every evening above 4,000 m and on the pass you will be very glad of it."
          : "A warm jacket for the evenings. It is colder after dark than the daytime walking suggests.",
        "A waterproof, windproof shell. Rain is possible in every season.",
        "Two pairs of trekking trousers. Zip-offs earn their keep low down.",
        "Underwear and socks for three or four days. You can get laundry done in the bigger villages.",
      ],
      note: "Layers you can take off one at a time beat one very warm thing. You will be hot climbing and cold within ten minutes of stopping.",
    },
    {
      id: "feet",
      title: "Feet",
      glyph: "walk",
      items: [
        "Broken-in boots with ankle support. Brand new boots are the most common way to ruin a trek.",
        "Three or four pairs of proper trekking socks.",
        "Something soft for the evenings — trainers or sandals with socks, which is the universal look of a teahouse dining room.",
        "Blister plasters, and put them on at the first hot spot rather than the first blister.",
      ],
    },
    {
      id: "sleeping",
      title: "Sleeping",
      glyph: "tent",
      items: [
        cold
          ? "A sleeping bag rated to about −10 °C. Lodges give you a blanket; at height it is not enough."
          : "A three-season sleeping bag, or a liner and the lodge blanket if you sleep warm.",
        "A silk or fleece liner. Warmer, and it keeps the bag clean.",
        "Earplugs. Plywood walls.",
      ],
      note: "We lend a down jacket, a four-season sleeping bag and a duffel for your porter — ask when you book, and bring nothing you would only buy for this.",
    },
    {
      id: "carry",
      title: "What you carry",
      glyph: "mountain",
      items: [
        "A 25–35 litre daypack with a rain cover.",
        "A duffel of 60–80 litres for the porter. Soft, not a wheeled suitcase.",
        "Trekking poles. Your knees will thank you on the descents, which are longer than the climbs.",
        "A headtorch and a spare set of batteries. Lodge power goes off, and the pass day starts in the dark.",
        "A one-litre bottle and a way to treat water.",
      ],
    },
    {
      id: "head",
      title: "Head and hands",
      glyph: "spark",
      items: [
        "A sun hat and category-4 sunglasses. The sun at altitude is ferocious and it comes off the snow as well as out of the sky.",
        "A warm hat and a buff.",
        cold ? "Liner gloves and insulated gloves or mitts over them." : "Light gloves for the early starts.",
        "Sunscreen at factor 50 and a lip balm with sun protection. The one people forget is the lip balm, every time.",
      ],
    },
    {
      id: "health",
      title: "Health and hygiene",
      glyph: "check",
      items: [
        "Your own small kit: painkillers, plasters, tape, rehydration salts, anything for a stomach upset, and whatever you normally take.",
        "Any prescription medicine in its own packaging, with enough for the whole trip and a few days over.",
        "Hand sanitiser and wet wipes. Washing is intermittent above the treeline.",
        "Toilet paper. Lodges do not supply it.",
      ],
      note: "Your guide carries a first-aid kit and, on the high routes, a pulse oximeter. This is for the small things so you are not asking somebody else for a plaster.",
    },
    {
      id: "papers",
      title: "Papers and money",
      glyph: "route",
      items: [
        "Passport, plus a couple of photocopies and several passport photographs for the permits.",
        "A printed copy of your insurance with the policy number and the emergency line.",
        long ? "Enough rupees in small notes for the whole walk." : "Rupees in small notes.",
        "A power bank, and a plug adaptor for Kathmandu.",
      ],
    },
  ];
}
