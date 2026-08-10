/**
 * Guide matcher (Feature Pack v3 Phase 5 — discovery). Pure scoring so it's
 * unit-testable: the server gathers facts, this ranks them and explains WHY
 * in plain words. The reasons ARE the product — a trekker in Berlin should
 * read them and think "this one gets me."
 */

export type Region = "Khumbu" | "Annapurna" | "Langtang" | "Manaslu";

export interface MatchQuery {
  /** null/undefined = anywhere. */
  region?: Region | null;
  /** 1–12; null = flexible. */
  month?: number | null;
  /** Per-person ceiling in USD cents; null = no ceiling. */
  budgetUsdCents?: number | null;
  /** A language beyond the default; null = English is fine. */
  language?: string | null;
  groupSize: number;
  /** Maps to route difficulty. null = any. */
  fitness?: "easy" | "moderate" | "tough" | null;
}

export interface OfferingFact {
  id: string;
  slug: string;
  kind: string;
  title: string;
  days: number;
  region: Region | null;
  difficulty: string | null;
  seasonMonths: number[] | null;
  /** Cheapest per-person at the query's group size (budget recomposer floor). */
  cheapestUsdCents: number | null;
  /** Displayed from-price per-person at the query's group size. */
  fromUsdCents: number | null;
}

export interface GuideFacts {
  guideId: string;
  tier: number;
  rating: number | null;
  reviewCount: number;
  porterWelfare: boolean;
  medianResponseMins: number | null;
  /** e.g. [{language:"German", proficiency:"basic"}] */
  languages: Array<{ language: string; proficiency: string }>;
  /** month (1-12) → count of open calendar days. */
  openDaysByMonth: Record<number, number>;
  offerings: OfferingFact[];
}

export interface MatchResult {
  guideId: string;
  score: number;
  reasons: string[];
  /** The offering that best fits the query (for the card's CTA). */
  bestOffering: OfferingFact | null;
}

const DIFF_FOR_FITNESS: Record<string, string[]> = {
  easy: ["easy"],
  moderate: ["easy", "moderate"],
  tough: ["moderate", "hard", "strenuous", "tough"],
};

function fmtUsd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/** Score one offering against the query. Returns score + reasons specific to it. */
function scoreOffering(o: OfferingFact, q: MatchQuery): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (q.region && o.region === q.region) {
    score += 30;
    reasons.push(`Runs ${o.title} in ${q.region}`);
  }
  if (q.month && o.seasonMonths?.includes(q.month)) {
    score += 20;
    reasons.push(`${monthName(q.month)} is in season for this route`);
  }
  if (q.budgetUsdCents != null && o.cheapestUsdCents != null) {
    if (o.cheapestUsdCents <= q.budgetUsdCents) {
      score += 25;
      reasons.push(`Fits your budget — doable from ${fmtUsd(o.cheapestUsdCents)} per person`);
    }
  }
  if (q.fitness && o.difficulty && DIFF_FOR_FITNESS[q.fitness]?.includes(o.difficulty)) {
    score += 10;
    reasons.push(`Difficulty (${o.difficulty}) matches your fitness`);
  }
  return { score, reasons };
}

export function monthName(m: number): string {
  return ["", "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"][m] ?? "";
}

/** Rank a guide for the query. Guide-level signals + their best offering. */
export function scoreGuide(f: GuideFacts, q: MatchQuery): MatchResult {
  let best: { o: OfferingFact; score: number; reasons: string[] } | null = null;
  for (const o of f.offerings) {
    const s = scoreOffering(o, q);
    if (!best || s.score > best.score) best = { o, score: s.score, reasons: s.reasons };
  }

  let score = best?.score ?? 0;
  const reasons = [...(best?.reasons ?? [])];

  // Availability in the chosen month — a guide with an open calendar wins.
  if (q.month) {
    const open = f.openDaysByMonth[q.month] ?? 0;
    if (open >= 7) {
      score += 15;
      reasons.push(`Has ${open} open days in ${monthName(q.month)}`);
    } else if (open > 0) {
      score += 6;
      reasons.push(`Some availability in ${monthName(q.month)}`);
    }
  }

  // Language beyond English.
  if (q.language) {
    const hit = f.languages.find(
      (l) => l.language.toLowerCase() === q.language!.toLowerCase(),
    );
    if (hit) {
      const pts = hit.proficiency === "native" || hit.proficiency === "fluent" ? 20 : 10;
      score += pts;
      reasons.push(`Speaks ${hit.language} (${hit.proficiency})`);
    }
  }

  // Track record: tier, rating, porter welfare, responsiveness.
  score += f.tier * 5;
  if (f.rating != null && f.reviewCount > 0) {
    score += Math.round(f.rating * 4);
    reasons.push(`Rated ${f.rating.toFixed(1)} by ${f.reviewCount} trekker${f.reviewCount === 1 ? "" : "s"}`);
  }
  if (f.porterWelfare) {
    score += 5;
    reasons.push("Porter-welfare pledge");
  }
  if (f.medianResponseMins != null && f.medianResponseMins <= 120) {
    score += 5;
    reasons.push("Replies fast — usually under 2 hours");
  }

  return { guideId: f.guideId, score, reasons, bestOffering: best?.o ?? null };
}

/** Rank all guides; drop zero-signal results when the query is specific. */
export function rankGuides(facts: GuideFacts[], q: MatchQuery): MatchResult[] {
  const specific = !!(q.region || q.month || q.budgetUsdCents || q.language || q.fitness);
  return facts
    .map((f) => scoreGuide(f, q))
    .filter((r) => (specific ? r.reasons.length > 0 : true))
    .sort((a, b) => b.score - a.score);
}
