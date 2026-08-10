/**
 * Every user-facing string lives here, keyed (CLAUDE.md hard rule #4), so the
 * copywriter can edit copy without touching components. Voice: warm, direct,
 * human, specific — zero tourism-brochure clichés (docs/01 §Copy voice).
 *
 * Seeded with the strings used so far; grows as screens land in M2+.
 */
export const copy = {
  brand: {
    positioning: "Pick your guide, not your agency.",
    tagline:
      "The only place in Nepal where you pick your guide, not your agency.",
  },
  home: {
    ctaFindGuide: "Find your guide",
    ctaMatch: "Match me in 5 questions",
    ctaBrowse: "Browse experiences",
  },
  trust: {
    everyGuideVerified: "Every guide verified",
    transparentPricing: "Transparent pricing",
    rescuePledge: "0% commission on rescue flights — ever",
    whatWeChecked: "What we checked",
  },
  booking: {
    requestToBook: "Request to book",
    freeCancellation: "Free cancellation until 30 days before",
  },
  guide: {
    earningsExplainer:
      "our 15% covers the customer, permits and payments.",
  },
  empty: {
    noEnquiries:
      "Your profile went live today. Most guides get their first enquiry within 2 weeks.",
  },
} as const;

export type CopyKeys = typeof copy;
