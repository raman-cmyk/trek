/**
 * Every word on /apply, in English and Nepali.
 *
 * A licensed guide in Kathmandu reads English as a second or third language,
 * on a phone, often while doing something else. The old page was
 * English-only, which puts the burden of translation on the person we are
 * asking to trust us with their citizenship card.
 *
 * One file, keyed, both languages side by side — so a missing Nepali string
 * is visible in the diff rather than discovered by a guide. The test asserts
 * that every key has both, which is the only way this stays true.
 *
 * Nepali here is plain and spoken, not formal written Nepali: this is a form,
 * not a government notice.
 */
import type { ProblemCode } from "~/lib/apply-flow";

export type Lang = "en" | "ne";

export const LANGS: { code: Lang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ne", label: "नेपाली" },
];

type Pair = { en: string; ne: string };

/** Errors, by the code `validateStep` hands back. */
export const PROBLEM: Record<ProblemCode, Pair> = {
  name_missing: {
    en: "We need the name printed on your licence.",
    ne: "तपाईंको लाइसेन्समा लेखिएको नाम लेख्नुहोस्।",
  },
  phone_missing: {
    en: "A phone number we can reach you on.",
    ne: "हामी सम्पर्क गर्न सक्ने फोन नम्बर लेख्नुहोस्।",
  },
  phone_digits: { en: "Digits only — no letters.", ne: "अंक मात्र — अक्षर नलेख्नुहोस्।" },
  phone_short: {
    en: "This number looks short — Nepali mobiles have 10 digits.",
    ne: "यो नम्बर छोटो देखिन्छ — नेपाली मोबाइल 10 अंकको हुन्छ।",
  },
  phone_long: {
    en: "This number looks long — Nepali mobiles have 10 digits.",
    ne: "यो नम्बर लामो देखिन्छ — नेपाली मोबाइल 10 अंकको हुन्छ।",
  },
  email_bad: {
    en: "An email address you can open.",
    ne: "तपाईं खोल्न सक्ने इमेल ठेगाना लेख्नुहोस्।",
  },
  password_short: {
    en: "Eight characters or more, so nobody else can get in.",
    ne: "8 वा बढी अक्षर — अरू कोही भित्र छिर्न नसकोस्।",
  },
  years_range: {
    en: "Years guiding — a number between 0 and 60.",
    ne: "गाइड गरेको वर्ष — 0 देखि 60 बिचको संख्या।",
  },
  rate_missing: {
    en: "What you charge for a day's work, in rupees.",
    ne: "एक दिनको कामको तपाईंको दर, रुपैयाँमा।",
  },
  rate_bad: {
    en: "A daily rate in rupees — digits only.",
    ne: "दैनिक दर रुपैयाँमा — अंक मात्र।",
  },
  licence_no_missing: {
    en: "Your licence number — it is the first thing we check.",
    ne: "तपाईंको लाइसेन्स नम्बर — हामी सबैभन्दा पहिले यही जाँच्छौं।",
  },
  licence_expiry_missing: {
    en: "The date on your licence card.",
    ne: "तपाईंको लाइसेन्स कार्डमा लेखिएको म्याद सकिने मिति।",
  },
  district_missing: {
    en: "The district you are from.",
    ne: "तपाईं कुन जिल्लाको हो।",
  },
  emergency_name_missing: {
    en: "One person we can call if something happens to you.",
    ne: "तपाईंलाई कुनै समस्या भए हामीले फोन गर्न सक्ने एक व्यक्ति।",
  },
  emergency_phone_missing: {
    en: "A number for that person.",
    ne: "उनको फोन नम्बर।",
  },
  heard_missing: {
    en: "Pick how you heard about us.",
    ne: "तपाईंले हाम्रो बारेमा कसरी सुन्नुभयो, छान्नुहोस्।",
  },
};

/** Everything else: labels, hints, headings, buttons. */
export const T = {
  // ── the page itself ────────────────────────────────────────────────────
  pageTitle: { en: "Become a guide", ne: "गाइड बन्नुहोस्" },
  whatsapp: { en: "Questions? WhatsApp us", ne: "प्रश्न छ? WhatsApp गर्नुहोस्" },
  saved: { en: "Saved", ne: "सुरक्षित भयो" },
  next: { en: "Next", ne: "अर्को" },
  back: { en: "Back", ne: "पछाडि" },
  edit: { en: "Edit", ne: "सम्पादन" },
  submit: { en: "Send my application", ne: "मेरो आवेदन पठाउनुहोस्" },
  sending: { en: "Sending…", ne: "पठाउँदै…" },
  /**
   * "Step 2 of 5" as one template, not two fragments.
   *
   * Nepali puts the total first — "५ मध्ये चरण २" — so composing it from a
   * "Step" and an "of" in English word order produces something a Nepali
   * reader has to unpick. Templates keep the order with the language.
   */
  stepCounter: { en: "Step {n} of {total}", ne: "{total} मध्ये चरण {n}" },
  optional: { en: "optional", ne: "ऐच्छिक" },

  // ── step 0, the intro ──────────────────────────────────────────────────
  introHeadline: { en: "Your name on the work.", ne: "काममा तपाईंको नाम।" },
  introStart: { en: "Start", ne: "सुरु गर्नुहोस्" },
  introTime: {
    en: "Takes about 10 minutes. Have your licence and citizenship card nearby.",
    ne: "करिब 10 मिनेट लाग्छ। लाइसेन्स र नागरिकता नजिकै राख्नुहोस्।",
  },
  proofRate: { en: "You keep 100% of your rate", ne: "तपाईंको दर पूरै तपाईंको" },
  proofPaid: { en: "Paid in NPR within 7 days", ne: "7 दिनभित्र रुपैयाँमा भुक्तानी" },
  proofNoAgency: {
    en: "No agency between you and the trekker",
    ne: "तपाईं र पर्यटकबीच कुनै एजेन्सी छैन",
  },

  // ── step headings ──────────────────────────────────────────────────────
  step1Head: { en: "Let's start with you.", ne: "पहिले तपाईंको बारेमा।" },
  step2Head: { en: "Tell trekkers how you walk.", ne: "तपाईं कसरी हिँड्नुहुन्छ, भन्नुहोस्।" },
  step3Head: { en: "Now the official part.", ne: "अब कागजी भाग।" },
  step4Head: { en: "Last step. This stays private.", ne: "अन्तिम चरण। यो गोप्य रहन्छ।" },
  step5Head: { en: "Check it over, then send.", ne: "एकचोटि हेर्नुहोस्, त्यसपछि पठाउनुहोस्।" },

  // ── fields ─────────────────────────────────────────────────────────────
  fullName: { en: "Full name", ne: "पूरा नाम" },
  fullNameHint: { en: "As written on your licence", ne: "लाइसेन्समा लेखिएको जस्तै" },
  phone: { en: "Phone or WhatsApp", ne: "फोन वा WhatsApp" },
  phoneHint: { en: "We call this number to verify you", ne: "पुष्टि गर्न हामी यही नम्बरमा फोन गर्छौं" },
  email: { en: "Email", ne: "इमेल" },
  emailHint: { en: "You sign in with this", ne: "यसैले साइन इन गर्नुहुन्छ" },
  password: { en: "Password", ne: "पासवर्ड" },
  passwordHint: { en: "At least 8 characters", ne: "कम्तीमा 8 अक्षर" },

  years: { en: "Years guiding", ne: "गाइड गरेको वर्ष" },
  dayRate: { en: "Your day rate", ne: "तपाईंको दैनिक दर" },
  dayRateHint: { en: "In rupees. You keep all of it.", ne: "रुपैयाँमा। पूरै तपाईंको हुन्छ।" },
  languagesLabel: { en: "Languages you guide in", ne: "तपाईं गाइड गर्ने भाषाहरू" },
  regionsLabel: { en: "Regions you work in", ne: "तपाईं काम गर्ने क्षेत्रहरू" },
  routesLabel: { en: "Trails you have led", ne: "तपाईंले नेतृत्व गरेका बाटोहरू" },
  routesHint: { en: "Tap a trail, then set how many times", ne: "बाटो छान्नुहोस्, कति पटक भन्नुहोस्" },
  hookLabel: { en: "One line about you", ne: "तपाईंको बारेमा एक वाक्य" },
  hookHint: {
    en: "The one thing a trekker gets only with you",
    ne: "तपाईंसँग मात्र पाइने एउटा कुरा",
  },

  licenceNo: { en: "Trekking licence number", ne: "ट्रेकिङ लाइसेन्स नम्बर" },
  licenceExpiry: { en: "Licence expires", ne: "लाइसेन्सको म्याद" },
  licencePhoto: { en: "Photo of your licence", ne: "लाइसेन्सको फोटो" },
  district: { en: "Home district", ne: "गृह जिल्ला" },
  districtHint: { en: "Search all 77", ne: "77 जिल्लामा खोज्नुहोस्" },

  idPhoto: { en: "Citizenship or National ID", ne: "नागरिकता वा राष्ट्रिय परिचयपत्र" },
  emergencyHead: { en: "Who we call in an emergency", ne: "आपतकालमा हामी कसलाई फोन गर्ने" },
  privacyPromise: {
    en: "Only our Kathmandu office sees this. Never shown on your profile. Never sent to trekkers. Deleted if you leave.",
    ne: "यो हाम्रो काठमाडौं कार्यालयले मात्र देख्छ। तपाईंको प्रोफाइलमा देखिँदैन। पर्यटकलाई पठाइँदैन। तपाईं छाड्नुभयो भने मेटिन्छ।",
  },

  heardLabel: { en: "How did you hear about us?", ne: "हाम्रो बारेमा कसरी सुन्नुभयो?" },
  heardWho: { en: "Their name", ne: "उनको नाम" },

  // ── uploads ────────────────────────────────────────────────────────────
  uploadCta: { en: "Take a photo or upload", ne: "फोटो खिच्नुहोस् वा अपलोड गर्नुहोस्" },
  uploadReceived: { en: "Received", ne: "प्राप्त भयो" },
  uploadRetry: { en: "Try again", ne: "फेरि प्रयास गर्नुहोस्" },

  // ── side panel ─────────────────────────────────────────────────────────
  previewCard: { en: "Preview my card", ne: "मेरो कार्ड हेर्नुहोस्" },
  cardCaption: {
    en: "This is how trekkers will see you.",
    ne: "पर्यटकले तपाईंलाई यसै रूपमा देख्नेछन्।",
  },
  pendingBadge: { en: "Pending verification", ne: "पुष्टि हुन बाँकी" },
  cardNamePlaceholder: { en: "Your name", ne: "तपाईंको नाम" },
  cardDistrictPlaceholder: { en: "Your district", ne: "तपाईंको जिल्ला" },
  cardHookPlaceholder: { en: "Your one line", ne: "तपाईंको एक वाक्य" },
  earningsHead: { en: "What that earns you", ne: "त्यसबाट तपाईंको कमाई" },
  keepAll: { en: "You keep 100%", ne: "पूरै तपाईंको" },
  howWeVerifyHead: { en: "How we verify you", ne: "हामी कसरी पुष्टि गर्छौं" },
  nextStepsHead: { en: "What happens next", ne: "अब के हुन्छ" },

  // ── success ────────────────────────────────────────────────────────────
  successHead: { en: "Welcome to the trail", ne: "बाटोमा स्वागत छ" },
  successReceived: { en: "Application received", ne: "आवेदन प्राप्त भयो" },
  talkToOffice: { en: "WhatsApp our office", ne: "हाम्रो कार्यालयमा WhatsApp गर्नुहोस्" },
} satisfies Record<string, Pair>;

export type CopyKey = keyof typeof T;

/** One string, in the chosen language. */
export function t(key: CopyKey, lang: Lang): string {
  return T[key][lang];
}

/** A string with {placeholders} filled in, keeping each language's order. */
export function tf(key: CopyKey, lang: Lang, vars: Record<string, string | number>): string {
  return t(key, lang).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** An error, in the chosen language. */
export function problemText(code: ProblemCode, lang: Lang): string {
  return PROBLEM[code][lang];
}

/** Which language to open in, from a stored choice or the browser's. */
export function pickLang(stored: string | null | undefined, accept?: string | null): Lang {
  if (stored === "ne" || stored === "en") return stored;
  if (accept && /\bne\b/i.test(accept)) return "ne";
  return "en";
}
