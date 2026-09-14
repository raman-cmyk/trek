/**
 * The guide's page, as a score.
 *
 * Six steps, one screen each, adding up to 100. A guide sees "your page is
 * 45% ready" and the next thing to do; the office sees the same number on
 * the dashboard. Every step is judged from the rows the public page actually
 * reads, so a step goes green because the thing is true, never because a
 * box was ticked.
 *
 * The weights say what gets somebody booked: a face and a first trip are
 * worth most, because a page with neither is a name in a list.
 */

export const SETUP_STEPS = [
  {
    key: "photo",
    label: "Your photo",
    short: "Photo",
    points: 20,
    hint: "Trekkers pick a face before they pick a trek.",
  },
  {
    key: "words",
    label: "Your words",
    short: "Words",
    points: 20,
    hint: "One promise only you can make, and a line under your name.",
  },
  {
    key: "where",
    label: "Where you guide",
    short: "Where",
    points: 15,
    hint: "The areas you work in and the routes you have walked.",
  },
  {
    key: "languages",
    label: "Languages",
    short: "Languages",
    points: 10,
    hint: "How trekkers filter. Every language is another search you appear in.",
  },
  {
    key: "rate",
    label: "Rate & payout",
    short: "Rate",
    points: 15,
    hint: "What a day with you costs, and where we send the money.",
  },
  {
    key: "trip",
    label: "Your first trip",
    short: "Trip",
    points: 20,
    hint: "The thing people book. Start with the trek you run most.",
  },
] as const;

export type SetupStepKey = (typeof SETUP_STEPS)[number]["key"];

export function isSetupStep(s: string | undefined): s is SetupStepKey {
  return SETUP_STEPS.some((st) => st.key === s);
}

/** What the page needs to know, reduced to facts. */
export interface SetupFacts {
  hasPhoto: boolean;
  promise: string | null;
  hook: string | null;
  bio: string | null;
  regions: number;
  routes: number;
  languages: number;
  dayRateCents: number | null;
  payoutAccount: string | null;
  offerings: number;
}

/** Facts from what loadGuideProfile returns. */
export function factsFrom(p: {
  guide: Record<string, any> | null;
  avatarUrl: string | null;
  photos: Array<{ kind: string }>;
  languages: Array<unknown>;
  walked: Array<unknown>;
  offeringCount: number;
}): SetupFacts {
  return {
    hasPhoto: !!p.avatarUrl || p.photos.some((ph) => ph.kind === "headshot"),
    promise: p.guide?.only_with_me ?? null,
    hook: p.guide?.hook_line ?? null,
    bio: p.guide?.bio ?? null,
    regions: (p.guide?.regions ?? []).length,
    routes: p.walked.length,
    languages: p.languages.length,
    dayRateCents: p.guide?.day_rate_usd_cents ?? null,
    payoutAccount: p.guide?.payout_account ?? null,
    offerings: p.offeringCount,
  };
}

export function stepDone(key: SetupStepKey, f: SetupFacts): boolean {
  switch (key) {
    case "photo":
      return f.hasPhoto;
    case "words":
      return !!f.promise?.trim() && (!!f.hook?.trim() || !!f.bio?.trim());
    case "where":
      return f.regions > 0 && f.routes > 0;
    case "languages":
      return f.languages > 0;
    case "rate":
      return (f.dayRateCents ?? 0) > 0 && !!f.payoutAccount?.trim();
    case "trip":
      return f.offerings > 0;
  }
}

export interface SetupProgress {
  steps: Array<(typeof SETUP_STEPS)[number] & { done: boolean }>;
  earned: number;
  total: number;
  percent: number;
  /** The first step still to do, in order. Null when everything is done. */
  next: SetupStepKey | null;
  complete: boolean;
}

export function setupProgress(f: SetupFacts): SetupProgress {
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: stepDone(s.key, f) }));
  const total = steps.reduce((n, s) => n + s.points, 0);
  const earned = steps.filter((s) => s.done).reduce((n, s) => n + s.points, 0);
  const next = steps.find((s) => !s.done)?.key ?? null;
  return {
    steps,
    earned,
    total,
    percent: Math.round((earned / total) * 100),
    next,
    complete: next === null,
  };
}

/**
 * Where "Continue" goes: the first unfinished step after this one, wrapping
 * round to an earlier one that is still open, so a guide who skipped the
 * photo is brought back to it rather than dropped on a finished page.
 */
export function stepAfter(key: SetupStepKey, f: SetupFacts): SetupStepKey | null {
  const i = SETUP_STEPS.findIndex((s) => s.key === key);
  const order = [...SETUP_STEPS.slice(i + 1), ...SETUP_STEPS.slice(0, i)];
  return order.find((s) => !stepDone(s.key, f))?.key ?? null;
}

export function stepBefore(key: SetupStepKey): SetupStepKey | null {
  const i = SETUP_STEPS.findIndex((s) => s.key === key);
  return i > 0 ? SETUP_STEPS[i - 1].key : null;
}
