/**
 * What this is called.
 *
 * The name lived as the literal "Trek" in a hundred and thirty places —
 * wordmarks, email from-lines, SMS prefixes, schema.org, a contract, a TIMS
 * card — which is how a rename becomes a week's work and still misses one.
 * Anything that composes a string uses these; prose in a page says the name
 * plainly, because a sentence built out of constants is unreadable.
 *
 * "trek" the noun is not this. A trek is a walk in the mountains and always
 * was; only the capitalised brand moved.
 */
export const BRAND = "Guides of Nepal";

/** The legal entity behind it — unchanged by the rename. */
export const LEGAL_ENTITY = "Grey Floor Pvt. Ltd.";

/** How a contract or a permit names us. */
export const COMPANY_NAME = `${BRAND} — ${LEGAL_ENTITY}`;

/**
 * What a guide sees at the front of an SMS. Kept short deliberately: Sparrow
 * bills per 160 characters, and every character here is one the message itself
 * does not get.
 */
export const SMS_PREFIX = "Guides of Nepal";
