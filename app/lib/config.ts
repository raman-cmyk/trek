/** Platform constants that aren't per-row data. */

// FX snapshot used when a booking is created (guide's NPR payout is fixed at
// booking time; the platform carries drift — docs/02 §Money). A nightly job can
// refresh this later; for now it's a single rate.
export const FX_RATE_NPR = 133; // NPR per 1 USD

// Deposit balance is charged this many days before start (docs/02).
export const BALANCE_CHARGE_DAYS_BEFORE = 14;
// Unpaid balance auto-cancels at this many days before start.
export const BALANCE_AUTOCANCEL_DAYS_BEFORE = 10;
// Accepted enquiry hold TTL before it expires back to open.
export const ENQUIRY_TTL_HOURS = 24;

/** v3 pricing canon: Trek's fee and The Fund, charged ON TOP of the package.
 *  The guide's fee is theirs in full. Seeded breakdowns use these same rates. */
export const TREK_FEE_PCT = 0.10;
export const FUND_PCT = 0.03;
