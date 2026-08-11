/**
 * ONE definition of the tier ladder (audit 7.6: /trust and the guide profile
 * described the same tiers differently — a trekker comparing the two got two
 * answers). Both pages read from here.
 */
export interface TierDef {
  tier: 1 | 2 | 3;
  name: string;
  what: string;
  checks: string[];
}

export const TIERS: TierDef[] = [
  {
    tier: 1,
    name: "Verified",
    what: "Government licence, photo ID and a working phone — all checked and dated. The bar to appear on Trek at all.",
    checks: [
      "TAAN / NMA licence verified",
      "Photo ID matched to the licence",
      "Reachable phone number",
    ],
  },
  {
    tier: 2,
    name: "Trusted",
    what: "Everything in Verified, plus references called and completed treks on the platform with real reviews behind them.",
    checks: [
      "TAAN / NMA licence verified",
      "Photo ID matched to the licence",
      "Reachable phone number",
      "Professional reference called",
      "Wilderness first-aid certificate on file",
    ],
  },
  {
    tier: 3,
    name: "Elite",
    what: "Our highest tier: a long track record, top ratings, and a safety record we've audited. Rare by design, and re-checked every year.",
    checks: [
      "TAAN / NMA licence verified",
      "Photo ID matched to the licence",
      "Reachable phone number",
      "Professional reference called",
      "Wilderness first-aid certificate on file",
      "50+ completed treks · 4.8+ rating",
      "Re-verified annually",
    ],
  },
];

export function tierChecks(tier: number): string[] {
  return (TIERS.find((t) => t.tier === Math.min(Math.max(tier, 1), 3)) ?? TIERS[0]).checks;
}
