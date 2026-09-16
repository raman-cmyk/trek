/**
 * The real-world facts /apply needs, in one place, all absent by default.
 *
 * The guide application asks a licensed stranger to send us their citizenship
 * card. Every element that makes that reasonable is a real-world fact we
 * either have or do not: an office they could walk into, a number they can
 * ring, and the name of the person who will call them.
 *
 * So each is empty until somebody fills it in, and the page renders nothing
 * where it is empty. An invented Kathmandu address or a made-up verification
 * officer would be the single worst thing on this site — it is the page whose
 * entire product is trust, shown to people who can check.
 *
 * `null` for PAYOUT_DAYS specifically: the brief said "paid within 7 days",
 * and there is no payout window anywhere in this codebase or its docs. Until
 * there is one the page says how a guide is paid without promising when.
 */

/** Digits only, country code first, no +. Powers every WhatsApp link. */
export const WHATSAPP = "";

export const OFFICE: {
  address: string;
  hours: string;
  /** The person who makes verification calls. Named, or not shown. */
  verifierName: string;
  verifierPhoto: string;
} = {
  address: "",
  hours: "",
  verifierName: "",
  verifierPhoto: "",
};

/**
 * Days after a trek ends that a guide is paid.
 *
 * Null until it is a real commitment somebody in Kathmandu can keep. Phase 1
 * pays guides by manual NPR batch, so this is an operations promise rather
 * than a property of the code.
 */
export const PAYOUT_DAYS: number | null = null;

/**
 * Inside this many days of departure, a guide keeps half their fee even if
 * the trekker cancels.
 *
 * Read off the real refund engine's bands (`policy.ts`: `d7_14` and `lt7`
 * both pay the guide 50% of their fee), not chosen for the page.
 */
export const LATE_CANCEL_DAYS = 14;
export const LATE_CANCEL_GUIDE_SHARE = "half";
