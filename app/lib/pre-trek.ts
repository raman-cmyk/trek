/**
 * "A few quick things before the trek."
 *
 * The brief was four lines — meeting point, three words about packing, three
 * about altitude — and it only appeared seven days out. Seven days out is too
 * late for most of it: boots have to be broken in, insurance has to cover
 * helicopter evacuation before it is bought, and a Lukla flight has to have
 * spare days built around it before the return leg is booked. The things a
 * trekker in Berlin actually asks their guide, over and over, are here
 * instead, from the day they pay.
 *
 * Written from the trip, not from a template: the altitude section only
 * appears when the trek goes high, the Lukla warning only for Khumbu, and the
 * cash estimate is this trek's own length. A brief that tells a day-hiker
 * about acclimatisation days is a brief nobody finishes reading.
 *
 * Everything here is the kind of thing a guide says in the first phone call.
 * It does not replace the guide — it is what stops the same four questions
 * being asked in every thread.
 */

export interface BriefItem {
  key: string;
  title: string;
  body: string;
}

export interface BriefSection {
  key: string;
  title: string;
  /** One line under the heading, shown while the section is folded shut. */
  hint: string;
  items: BriefItem[];
}

export interface TripFacts {
  kind: string;
  /** Nights on the trail, as sold. */
  days: number;
  maxAltitudeM: number | null;
  region: string | null;
  /** ISO date, for the season the trek falls in. */
  startDate: string;
  partySize: number;
}

/** Nepali trekking seasons, which are not the European ones. */
export type Season = "spring" | "monsoon" | "autumn" | "winter";

export function seasonOf(startIso: string): Season {
  const m = Number(startIso.slice(5, 7));
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "monsoon";
  if (m >= 9 && m <= 11) return "autumn";
  return "winter";
}

/** Roughly what to carry in rupees for the extras nobody includes. */
export function cashEstimateNpr(days: number): { low: number; high: number } {
  // 2,000–3,500 a day covers hot drinks, charging, wifi, a hot shower and the
  // odd chocolate bar, plus a small buffer for a night nobody planned.
  const low = Math.round((days * 2000 + 5000) / 1000) * 1000;
  const high = Math.round((days * 3500 + 10000) / 1000) * 1000;
  return { low, high };
}

const npr = (n: number) => `Rs ${n.toLocaleString("en-US")}`;

/**
 * What a trekker should know, in the order they will need it: the things that
 * cost money, the things that go in the bag, the things that keep them well,
 * and the things to do before the plane.
 */
export function preTrekBrief(trip: TripFacts): BriefSection[] {
  const isTrek = trip.kind === "trek";
  const high = (trip.maxAltitudeM ?? 0) >= 3000;
  const veryHigh = (trip.maxAltitudeM ?? 0) >= 4500;
  const season = seasonOf(trip.startDate);
  const region = (trip.region ?? "").toLowerCase();
  const cash = cashEstimateNpr(Math.max(trip.days, 1));

  // A day out of Kathmandu is a different animal: no teahouses, no porters,
  // no acclimatisation. Four things, and then let them get on with it.
  if (!isTrek) {
    return [
      {
        key: "bring",
        title: "What to bring",
        hint: "Shoes, water, sun, a warm layer.",
        items: [
          {
            key: "shoes",
            title: "Shoes with grip",
            body: "Trainers are fine on a good path; anything steep or wet wants a proper sole. Nepali trails are stone, and stone is slick in the morning.",
          },
          {
            key: "water",
            title: "Two litres of water",
            body: "More than you think, even on a short day. Your guide knows where it can be refilled.",
          },
          {
            key: "sun",
            title: "Sun hat and sunscreen",
            body: "The sun at this altitude burns through cloud. It catches almost everybody on their first day.",
          },
          {
            key: "layer",
            title: "One warm layer, one rain layer",
            body: "It can be twenty degrees in the sun and eight in the shade an hour later.",
          },
        ],
      },
      {
        key: "money",
        title: "Money",
        hint: "Small notes, and cash for lunch.",
        items: [
          {
            key: "cash",
            title: `Carry about ${npr(3000)}, in small notes`,
            body: "Tea houses and shops on the way are cash only, and a Rs 1,000 note for a Rs 60 tea is a problem for the person selling the tea.",
          },
          {
            key: "tip",
            title: "Tipping is normal, and not expected",
            body: "If the day was good, Rs 1,000–2,000 is the usual thank-you. Nobody will ask.",
          },
        ],
      },
    ];
  }

  const sections: BriefSection[] = [];

  sections.push({
    key: "money",
    title: "Money on the trail",
    hint: `Cash only above the road. Bring ${npr(cash.low)}–${npr(cash.high)}.`,
    items: [
      {
        key: "cash",
        title: `Bring ${npr(cash.low)}–${npr(cash.high)} in cash`,
        body: `Your trek is paid for. This is for what nobody includes: hot drinks, charging, wifi, a hot shower, snacks. Draw it in Kathmandu or Pokhara — the last reliable ATM is at the start of the trail, and it runs out of money in season.`,
      },
      {
        key: "cards",
        title: "Cards do not work up there",
        body: "No teahouse takes a card. A few of the bigger lodges say they do, at a fee, when the network is up — plan as though none of them do.",
      },
      {
        key: "notes",
        title: "Ask for small notes",
        body: "Rs 100s and 500s. Nobody on the trail can change a Rs 1,000 note early in the morning.",
      },
      {
        key: "tips",
        title: "Tipping, honestly",
        body: `At the end, if you were well looked after: about USD 10 a day for your guide and USD 6–8 for a porter is what most groups give, split between you if there are ${trip.partySize > 1 ? "several of you" : "more of you"}. It is a thank-you, not a bill, and your guide is paid properly either way.`,
      },
    ],
  });

  sections.push({
    key: "bag",
    title: "Your bag",
    hint: "One duffel for the porter, one daypack for you.",
    items: [
      {
        key: "weight",
        title: "10 kg in the duffel, per person",
        body: "That is what a porter carries for you, and it is a rule we hold to — one porter carries two of these. Everything else stays in Kathmandu; your hotel will store it for free until you come back.",
      },
      {
        key: "daypack",
        title: "You carry the day's things",
        body: "Water, a warm layer, a rain layer, sun cream, your camera, your documents. Your duffel walks ahead of you and you will not see it until evening.",
      },
      {
        key: "boots",
        title: "Boots you have already walked in",
        body: "Not new ones. Blisters on day two are the single most common reason a trek stops being fun, and there is nothing anybody can do about them once you are up there.",
      },
      {
        key: "sleeping",
        title: `A sleeping bag rated to ${season === "winter" ? "−20°C" : high ? "−10°C" : "0°C"}`,
        body: "Teahouses give you a bed and a blanket, not a bag. Renting one in Thamel is about Rs 100–200 a day and perfectly normal — tell your guide and they will take you to a shop that does not overcharge you.",
      },
      ...(season === "monsoon"
        ? [
            {
              key: "rain",
              title: "Proper rain gear, and a dry bag",
              body: "It rains most afternoons at this time of year. A pack cover is not enough on its own — put anything electronic inside a dry bag.",
            },
          ]
        : []),
      ...(season === "winter"
        ? [
            {
              key: "cold",
              title: "Down jacket, gloves, a hat that covers your ears",
              body: "The walking keeps you warm. The evenings, in a dining room heated by one stove lit at six, do not.",
            },
          ]
        : []),
    ],
  });

  if (high) {
    sections.push({
      key: "altitude",
      title: "Staying well up high",
      hint: `This trek reaches ${(trip.maxAltitudeM ?? 0).toLocaleString("en-US")} m.`,
      items: [
        {
          key: "slow",
          title: "The slow days are the point",
          body: "Your itinerary has short days and rest days built into it that look wasteful on paper. They are the reason people get to the top. Nobody is trying to save you time.",
        },
        {
          key: "water",
          title: "Three to four litres a day",
          body: "Most of what feels like altitude sickness on the first high day is simply not drinking enough in dry, cold air.",
        },
        {
          key: "tell",
          title: "Say something the same day",
          body: "A headache, a bad night, no appetite — tell your guide that evening, not the next morning. Early it is a slower day and an aspirin. Late it is a helicopter.",
        },
        ...(veryHigh
          ? [
              {
                key: "diamox",
                title: "Ask your own doctor about Diamox before you fly",
                body: "Plenty of people take it and plenty do not. It is a decision for a doctor who knows you, and one that is easier to make at home than in a lodge at 4,000 m.",
              },
            ]
          : []),
        {
          key: "drink",
          title: "Go easy on alcohol the first nights high up",
          body: "It makes the same night's sleep considerably worse, and sleep is what acclimatising mostly is.",
        },
      ],
    });
  }

  sections.push({
    key: "phone",
    title: "Phone, power and wifi",
    hint: "Buy a local sim at the airport. Bring a power bank.",
    items: [
      {
        key: "sim",
        title: "A Nepali sim, bought at the airport",
        body: "Ncell or NTC, about Rs 1,000 with data, and they will want your passport. NTC has the better signal in the mountains. It is the cheapest thing you will do all trip and it means your guide can always reach you.",
      },
      {
        key: "power",
        title: "Charging costs money up there",
        body: "Rs 200–500 an hour in most lodges, and the socket is in the dining room. A 10,000 mAh power bank means you are not queueing for it every evening.",
      },
      {
        key: "wifi",
        title: "Wifi is sold by the device",
        body: "Rs 500–900 a night in the high villages, and slow. Tell people at home you will message when you can, not every day, so nobody worries on a day the network is down.",
      },
      {
        key: "cold-battery",
        title: "Keep your phone warm at night",
        body: "A cold battery is a dead battery by morning. In your sleeping bag with you.",
      },
    ],
  });

  sections.push({
    key: "water",
    title: "Water and food",
    hint: "Treat your water. Eat the dal bhat.",
    items: [
      {
        key: "treat",
        title: "Purification, not bottled water",
        body: "Tablets, drops or a filter — a bottle at 4,000 m costs Rs 300 and the empty stays in the mountains. Boiled water from the kitchen is fine and costs less.",
      },
      {
        key: "dalbhat",
        title: "Dal bhat is the thing to order",
        body: "Cooked fresh in every kitchen, and they refill your plate for nothing. The lasagne at 4,000 m has been thawed and refrozen more times than anybody knows.",
      },
      {
        key: "meat",
        title: "Skip the meat high up",
        body: "It has been carried up unrefrigerated for two or three days. Your guide will not eat it either.",
      },
      {
        key: "diet",
        title: "Tell your guide what you cannot eat, now",
        body: "Vegetarian and vegan are easy in Nepal. Gluten, nuts and dairy need planning, and the planning happens before you leave, not in a kitchen at Namche.",
      },
    ],
  });

  const travel: BriefItem[] = [
    {
      key: "passport",
      title: "Passport valid six months past your return, two blank pages",
      body: "Airlines check this at check-in, and a six-month rule catches people out every season.",
    },
    {
      key: "visa",
      title: "Visa on arrival, in cash",
      body: "USD 50 for 30 days, paid at the airport in dollars — bring clean notes and a passport photo. The queue is faster if you fill the form online the day before.",
    },
    {
      key: "insurance",
      title: `Insurance covering trekking to ${(trip.maxAltitudeM ?? 4000).toLocaleString("en-US")} m and helicopter evacuation`,
      body: "Ordinary travel insurance stops at 3,000 m and excludes rescue. Check the altitude number and the word “evacuation” in the policy itself, not on the sales page.",
    },
    {
      key: "photos",
      title: "Four passport photos",
      body: "Permits, the visa form, and whatever else asks. They cost nothing at home and are a small errand in Kathmandu.",
    },
  ];

  if (region.includes("khumbu") || region.includes("everest")) {
    travel.push({
      key: "lukla",
      title: "Keep two spare days around the Lukla flight",
      body: "It is weather-dependent and it does get cancelled, sometimes for a day or two. In the busy months it also flies from Ramechhap, four hours' drive from Kathmandu, leaving before dawn. Do not book your flight home for the evening you walk out.",
    });
  }
  if (region.includes("manaslu") || region.includes("mustang") || region.includes("dolpo")) {
    travel.push({
      key: "restricted",
      title: "This is a restricted area",
      body: "The permit is issued to a group with a licensed guide, it takes your real passport for a day in Kathmandu, and it cannot be rushed. We file it — you just need to be in the country when we say.",
    });
  }
  if (season === "monsoon") {
    travel.push({
      key: "flights",
      title: "Mountain flights slip in the monsoon",
      body: "Build a spare day in at each end. The road alternative exists everywhere except Lukla, and it is long but it works.",
    });
  }

  sections.push({
    key: "before",
    title: "Before you fly",
    hint: "Passport, visa, insurance, photos.",
    items: travel,
  });

  return sections;
}
