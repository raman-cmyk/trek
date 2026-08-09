/**
 * Cancellation policy — the refund/compensation matrix (docs/02 §Cancellation).
 * Money is integer cents throughout.
 *
 * | Trekker cancels | Refund to trekker    | Guide compensation   |
 * |-----------------|----------------------|----------------------|
 * | ≥30 days        | 100% − Stripe fees   | 0                    |
 * | 15-29 days      | 50%                  | 25% of guide fee     |
 * | 7-14 days       | 25%                  | 50% of guide fee     |
 * | <7 days         | 0%                   | 50% of guide fee     |
 * | Force majeure   | 100%                 | 0 (platform eats fees)|
 *
 * Guide cancels: trekker 100% refund always; guide penalty ladder tracked in
 * guide_strikes (strike 1 warning, strike 2 ranking penalty 90d, strike 3 removal).
 */

export type CancellationBand =
  | "ge30"
  | "d15_29"
  | "d7_14"
  | "lt7"
  | "force_majeure"
  | "guide_cancel";

export type CancelReason = "trekker" | "force_majeure" | "guide";

export interface CancellationInput {
  /** What the trekker has paid so far (deposit, or full). Refund % applies to this. */
  totalPaidUsdCents: number;
  /** Guide fee component — guide compensation % applies to this. */
  guideFeeUsdCents: number;
  /** Whole days between now and trek start (trekker-initiated bands). */
  daysUntilStart: number;
  reason: CancelReason;
}

export interface CancellationOutcome {
  band: CancellationBand;
  refundToTrekkerUsdCents: number;
  guideCompensationUsdCents: number;
  /** Withheld from the refund (≥30-day band only); 0 otherwise. */
  stripeFeesWithheldUsdCents: number;
  /** True when the platform absorbs the Stripe fees (force majeure). */
  platformAbsorbsFees: boolean;
}

/** Stripe processing fee estimate: 2.9% + $0.30 (docs/02 — non-refundable). */
export function estimateStripeFeeUsdCents(amountUsdCents: number): number {
  if (amountUsdCents <= 0) return 0;
  return Math.round(amountUsdCents * 0.029) + 30;
}

export function bandFor(input: CancellationInput): CancellationBand {
  if (input.reason === "guide") return "guide_cancel";
  if (input.reason === "force_majeure") return "force_majeure";
  const d = input.daysUntilStart;
  if (d >= 30) return "ge30";
  if (d >= 15) return "d15_29";
  if (d >= 7) return "d7_14";
  return "lt7";
}

export function computeCancellation(
  input: CancellationInput,
): CancellationOutcome {
  const { totalPaidUsdCents: paid, guideFeeUsdCents: guideFee } = input;
  const band = bandFor(input);

  const pct = (amount: number, p: number) => Math.round(amount * p);

  switch (band) {
    case "guide_cancel":
      // Trekker made whole; guide penalised via strikes, not compensated.
      return {
        band,
        refundToTrekkerUsdCents: paid,
        guideCompensationUsdCents: 0,
        stripeFeesWithheldUsdCents: 0,
        platformAbsorbsFees: true,
      };
    case "force_majeure":
      return {
        band,
        refundToTrekkerUsdCents: paid,
        guideCompensationUsdCents: 0,
        stripeFeesWithheldUsdCents: 0,
        platformAbsorbsFees: true,
      };
    case "ge30": {
      const fee = estimateStripeFeeUsdCents(paid);
      return {
        band,
        refundToTrekkerUsdCents: Math.max(0, paid - fee),
        guideCompensationUsdCents: 0,
        stripeFeesWithheldUsdCents: fee,
        platformAbsorbsFees: false,
      };
    }
    case "d15_29":
      return {
        band,
        refundToTrekkerUsdCents: pct(paid, 0.5),
        guideCompensationUsdCents: pct(guideFee, 0.25),
        stripeFeesWithheldUsdCents: 0,
        platformAbsorbsFees: false,
      };
    case "d7_14":
      return {
        band,
        refundToTrekkerUsdCents: pct(paid, 0.25),
        guideCompensationUsdCents: pct(guideFee, 0.5),
        stripeFeesWithheldUsdCents: 0,
        platformAbsorbsFees: false,
      };
    case "lt7":
      return {
        band,
        refundToTrekkerUsdCents: 0,
        guideCompensationUsdCents: pct(guideFee, 0.5),
        stripeFeesWithheldUsdCents: 0,
        platformAbsorbsFees: false,
      };
  }
}

export type StrikeConsequence = "warning" | "ranking_penalty_90d" | "removal";

/**
 * Guide-cancel strike ladder (docs/02). `priorStrikes` is how many strikes the
 * guide already had; the returned consequence is for the strike being issued now.
 */
export function guideStrikeConsequence(priorStrikes: number): StrikeConsequence {
  const thisStrike = priorStrikes + 1;
  if (thisStrike <= 1) return "warning";
  if (thisStrike === 2) return "ranking_penalty_90d";
  return "removal";
}
