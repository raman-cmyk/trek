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
      "Your fee is yours in full — Guides of Nepal' 10% is added on top of the package, paid by the trekker.",
    // The guide's home screen, in the order a guide actually works. Short
    // sentences, no platform words: "experiences" and "journeys" were two of
    // the six labels that sent a guide to the wrong screen. "Trips you offer"
    // and "Trips you're leading" cannot be mistaken for one another.
    home: {
      offerLabel: "Trips you offer",
      offerNote: "What people can book.",
      calendarLabel: "Your calendar",
      calendarNote: "Block the days you're away.",
      leadingLabel: "Trips you're leading",
      leadingNote: "Who's coming, and when.",
      questionsLabel: "Questions people asked you",
      questionsNote: "Answer them on your page, where everyone can read it.",
      questionsWaiting: "waiting on an answer",
      moneyLabel: "Your money",
      moneyNote: "What you're owed, and what's been paid.",
      reviewsLabel: "Reviews",
      reviewsNote: "What trekkers said about walking with you.",
      writeUpLabel: "Write up a trek",
      writeUpNote: "Your photos and your words. This is what makes people pick you.",
      noTripListed:
        "Your page is not shown to anyone until you list one trip.",
      listOneTrip: "List a trip →",
    },
    // Where a guide's wages go. Plain words: this is money, it is read on a
    // phone, and for most guides it is a third language.
    payout: {
      title: "Where your money goes",
      lede:
        "We pay you in Nepali rupees, by hand, within 7 days of each trek ending. "
        + "Tell us where to send it.",
      methodLabel: "How you want to be paid",
      methodBlank: "Choose one",
      nameLabel: "Name on the account",
      nameHint: "Exactly as your bank or wallet has it.",
      bankLabel: "Which bank",
      branchLabel: "Which branch",
      qrTitle: "Your QR",
      qrLede:
        "A photo of your eSewa, Khalti or bank QR. Only our office can open it — "
        + "it is never shown on your public page.",
      qrReplace: "Replace it",
      qrAdd: "Add your QR",
      qrNone: "No QR yet.",
      panTitle: "PAN number",
      panLede:
        "Your tax number, if you have one. Nothing waits on this — we pay you "
        + "either way. We ask only because the office needs it at year end.",
      ready: "We know where to send your money.",
      notReady: "We cannot pay you yet",
      saved: "Saved.",
    },
  },
  empty: {
    noEnquiries:
      "Your profile went live today. Most guides get their first enquiry within 2 weeks.",
    newGuide: "New here — be the first to trek with them.",
    noJournals:
      "The next journal isn't written yet. Book them this season and you'll be in it.",
    threadStarter:
      "Say hello — ask about the route, your dates, how fit you need to be, anything.",
    noneFreeThoseDays: "No one's free those exact days. Here's who's free the week either side.",
  },
} as const;

export type CopyKeys = typeof copy;
