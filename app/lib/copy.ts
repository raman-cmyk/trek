/**
 * Every user-facing string lives here, keyed (CLAUDE.md hard rule #4), so the
 * copywriter can edit copy without touching components. Voice: warm, direct,
 * human, specific — zero tourism-brochure clichés (docs/01 §Copy voice).
 *
 * Two standing rules, enforced across the codebase:
 *
 *   1. State what is, never what you are not. "No hidden fees" makes a reader
 *      wonder who is hiding fees; "every rupee, itemised" just tells them.
 *      There is no negation anywhere in this file, and there should not be
 *      one anywhere else either.
 *   2. Where a real name is available, use it. "Message Pemba", never
 *      "Message the guide" — the whole product is that there is a person.
 *
 * Seeded with the strings used so far; grows as screens land in M2+.
 */
export const copy = {
  brand: {
    positioning: "Know who's walking with you.",
    tagline:
      "Choose your guide first — see their treks, hear their voice, message them free.",
  },
  home: {
    ctaFindGuide: "Find your guide",
    ctaMatch: "Match me in 5 questions",
    ctaBrowse: "Browse experiences",
    heroTitle: "Know who's walking with you.",
    heroSub:
      "Choose your guide first — see their treks, hear their voice, message them free. When it feels right, book. That's the whole thing.",
  },
  trust: {
    everyGuideVerified: "Every guide checked, dated, and signed off",
    everyGuideVerifiedBody:
      "Licence, first aid, references. You can read the receipts.",
    transparentPricing: "Every rupee, itemised",
    transparentPricingBody:
      "Guide, permits, porters, fund — you see the whole split before you pay.",
    rescuePledge: "If you ever need a helicopter, we earn nothing from it",
    whatWeChecked: "What we checked",
  },
  booking: {
    requestToBook: "Request to book",
    freeCancellation: "Free cancellation until 30 days before",
  },
  guide: {
    earningsExplainer:
      "Your fee is yours in full — Trek's 10% is added on top of the package, paid by the trekker.",
  },
  setup: {
    title: "Set up your page",
    percentReady: "Your page is {percent}% ready",
    readyTitle: "Your page is ready",
    readyBody: "Everything a trekker needs to pick you is on your page. Keep it fresh after each trek.",
    stepOf: "Step {n} of {total}",
    worth: "worth {points} points",
    back: "Back",
    allSteps: "All steps",
    continue: "Continue",
    skip: "Skip for now",
    start: "Start with the next thing",
    seeYourPage: "See your page the way trekkers will",
    backHome: "Back to home",
    previewLabel: "How trekkers see you",
    previewNoHook: "A line under your name goes here",
    previewNoPromise: "Your one promise goes here",
    previewEmpty: "Areas, routes, languages and your rate show here",
    noTripYet: "Nothing to book yet.",
    tripsListed: "{n} listed. Our team checks each one before it goes live.",
    tripHint: "A trip is what people actually book: the trek, the days, the price. Start with the one you run most; you can add more later.",
    listFirst: "List your first trip",
    listAnother: "List another",
  },
  blocked: {
    title: "Your account is paused",
    titleBanned: "Your account has been closed",
    body: "Something on your account needs a person to look at it. Write to us and a human will reply.",
    writeToUs: "Write to hello@guidesofnepal.com",
    backHome: "Back to the home page",
  },
  empty: {
    noEnquiries:
      "Your profile went live today. Most guides get their first enquiry within 2 weeks.",
    newGuide: "New to Trek — be the first to trek with them.",
    noJournals:
      "The next journal isn't written yet. Book them this season and you'll be in it.",
    threadStarter:
      "Say hello — ask about the route, your dates, how fit you need to be, anything.",
    noneFreeThoseDays: "No one's free those exact days. Here's who's free the week either side.",
  },
} as const;

export type CopyKeys = typeof copy;
