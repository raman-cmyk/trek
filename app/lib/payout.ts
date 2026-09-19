/**
 * Where a guide's wages go.
 *
 * Payouts are made by hand, in NPR, by a person in Kathmandu reading a screen
 * and typing a number into a banking app. Everything here exists because that
 * person needs to be able to do it without guessing, and because the guide on
 * the other end has no way to tell that the number we hold is wrong until the
 * money does not arrive.
 *
 * What was wrong with the form this replaces:
 *
 *   - One free-text box called "Payout account" served an eSewa number and a
 *     bank account alike, with nowhere to put a bank name or a branch — which
 *     is most of what a Nepali transfer actually needs.
 *   - Every field was skip-if-blank, so a wrong number could be overwritten
 *     but never removed.
 *   - The method dropdown had no empty option, so a guide who had chosen
 *     nothing saw "eSewa" selected and reasonably believed it was set. Four
 *     guides on file have no method at all.
 *
 * House style: plain predicates returning plain English, so the guide's page,
 * the ops payout ledger and the tests all say the same sentence.
 */

export const PAYOUT_METHODS = ["esewa", "khalti", "bank"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  esewa: "eSewa",
  khalti: "Khalti",
  bank: "Bank account",
};

export interface PayoutDetails {
  method?: string | null;
  account?: string | null;
  accountName?: string | null;
  bankName?: string | null;
  branch?: string | null;
}

export function isPayoutMethod(v: unknown): v is PayoutMethod {
  return typeof v === "string" && (PAYOUT_METHODS as readonly string[]).includes(v);
}

/**
 * What to call the number box, for the method chosen.
 *
 * One column, an honest label. "Payout account" above a box where a guide is
 * meant to type the phone number their eSewa is registered to is a question
 * nobody can answer confidently.
 */
export function accountLabel(method?: string | null): string {
  if (method === "esewa") return "Your eSewa number";
  if (method === "khalti") return "Your Khalti number";
  if (method === "bank") return "Account number";
  return "Account or wallet number";
}

/** The hint under it, for the method chosen. */
export function accountHint(method?: string | null): string {
  if (method === "esewa" || method === "khalti")
    return "The mobile number the wallet is registered to.";
  if (method === "bank") return "The full account number, no spaces.";
  return "";
}

/** Only a bank transfer needs somewhere to send it to. */
export function needsBankFields(method?: string | null): boolean {
  return method === "bank";
}

const NAME_MIN = 2;
const ACCOUNT_MIN = 5;

/**
 * Everything wrong with these details, in the order a person would fix it.
 *
 * Returns sentences, not codes: the same list is read by a guide on a phone
 * and by whoever is about to send them money, and both need to know what to
 * do rather than which field failed.
 */
export function payoutProblems(d: PayoutDetails): string[] {
  const out: string[] = [];
  const method = (d.method ?? "").trim();
  const account = (d.account ?? "").trim();
  const name = (d.accountName ?? "").trim();
  const bank = (d.bankName ?? "").trim();

  if (!method) {
    out.push("No payout method chosen.");
  } else if (!isPayoutMethod(method)) {
    out.push("That payout method isn't one we can pay to.");
  }

  if (!account) {
    out.push("No account or wallet number.");
  } else if (account.replace(/\s/g, "").length < ACCOUNT_MIN) {
    out.push("That account number is too short to be real.");
  }

  // A number without a name is the commonest reason an NPR transfer bounces,
  // which is why the office page says so out loud beside it.
  if (!name) {
    out.push("No name on the account.");
  } else if (name.length < NAME_MIN) {
    out.push("That name is too short to match a bank record.");
  }

  if (needsBankFields(method) && !bank) {
    out.push("No bank name — a bank account number alone can't be paid.");
  }

  return out;
}

/** The one-liner version, for a table cell. Null when there is nothing wrong. */
export function whatIsMissing(d: PayoutDetails): string | null {
  const problems = payoutProblems(d);
  return problems.length ? problems.join(" ") : null;
}

/** Enough to send money to. */
export function payoutReady(d: PayoutDetails): boolean {
  return payoutProblems(d).length === 0;
}

/**
 * How the details read on one line, for the person doing the transfer.
 *
 * "eSewa 98xxxxxxx1 · Pemba Sherpa", or for a bank the bank and branch too.
 * Unset parts are simply absent rather than rendered as "null".
 */
export function payoutLine(d: PayoutDetails): string {
  const method = (d.method ?? "").trim();
  const label = isPayoutMethod(method) ? PAYOUT_METHOD_LABELS[method] : method;
  const parts = [
    label || null,
    (d.account ?? "").trim() || null,
    needsBankFields(method) ? (d.bankName ?? "").trim() || null : null,
    needsBankFields(method) ? (d.branch ?? "").trim() || null : null,
    (d.accountName ?? "").trim() || null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing on file";
}

/**
 * A PAN as Nepal issues it: nine digits.
 *
 * Asked for only after a guide is verified, and blocking nothing — it is a tax
 * number, not a safety check (see AFTER_VERIFIED in guide-checks.ts). An empty
 * string is therefore fine and means "clear it", not "invalid".
 */
export function panProblem(pan: string): string | null {
  const v = pan.trim();
  if (!v) return null;
  if (!/^\d+$/.test(v)) return "A PAN is digits only — no letters or dashes.";
  if (v.length !== 9) return "A Nepali PAN is nine digits.";
  return null;
}

/** Normalised for storage: digits, or null when the guide cleared it. */
export function cleanPan(pan: string): string | null {
  const v = pan.trim();
  return v ? v : null;
}
