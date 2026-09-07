/**
 * Emergency contacts.
 *
 * The one number that matters is the one nobody thinks to ask for. The columns
 * have been on `users` since 0001 and only the ops console could ever write
 * them; nobody was asked at signup, and a guide was not asked at all — so when
 * a guide broke an ankle above Namche the office spent an afternoon ringing
 * round to find his brother.
 *
 * Both sides now, one parser, and the form fields are named for the columns so
 * the ops console's own form keeps working against the same rules.
 */

export interface EmergencyContact {
  name: string;
  relationship: string | null;
  phone: string;
  email: string | null;
}

/** The row shape, on `users`. */
export interface EmergencyRow {
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_email?: string | null;
}

/**
 * The usual answers, so it is a tap rather than a spelling. "Someone else"
 * stays last and stays free — plenty of people's person is not on a list.
 */
export const RELATIONSHIPS = [
  "Partner or spouse",
  "Parent",
  "Son or daughter",
  "Brother or sister",
  "Friend",
  "Someone else",
] as const;

/** Digits only, so “+44 7700 900 123” and “+447700900123” count the same. */
function digits(s: string): string {
  return s.replace(/\D/g, "");
}

export type ParseResult =
  | { ok: true; value: EmergencyContact }
  | { ok: false; error: string };

/**
 * Read the four fields off a submitted form.
 *
 * Name and phone are the only ones we insist on: a name with no number is a
 * note to nobody, and a number with no name is a stranger's phone ringing at
 * three in the morning.
 */
export function parseEmergency(form: {
  get(key: string): FormDataEntryValue | null;
}): ParseResult {
  const str = (k: string) => String(form.get(k) ?? "").trim();

  const name = str("emergency_contact_name");
  const phone = str("emergency_contact_phone");
  const relationship = str("emergency_contact_relationship");
  const email = str("emergency_contact_email");

  if (!name) return { ok: false, error: "Who should we call? A name, please." };
  if (!phone) return { ok: false, error: "We need a phone number for them." };
  if (digits(phone).length < 7) {
    return { ok: false, error: "That phone number looks too short — include the country code." };
  }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "That email address doesn’t look right." };
  }

  return {
    ok: true,
    value: {
      name,
      relationship: relationship || null,
      phone,
      email: email || null,
    },
  };
}

/** The columns to write, so no caller has to spell them out. */
export function emergencyPatch(c: EmergencyContact): Required<EmergencyRow> {
  return {
    emergency_contact_name: c.name,
    emergency_contact_relationship: c.relationship,
    emergency_contact_phone: c.phone,
    emergency_contact_email: c.email,
  };
}

/** Is there enough here to ring somebody? */
export function hasEmergency(row: EmergencyRow | null | undefined): boolean {
  return Boolean(row?.emergency_contact_name && row?.emergency_contact_phone);
}

/** One line for the guide's screen and the office's: "Mia Roth (partner) — +49…". */
export function emergencyLine(row: EmergencyRow): string | null {
  if (!hasEmergency(row)) return null;
  const rel = row.emergency_contact_relationship
    ? ` (${row.emergency_contact_relationship.toLowerCase()})`
    : "";
  return `${row.emergency_contact_name}${rel} — ${row.emergency_contact_phone}`;
}

/** Strip a number down to something a tel: link can dial. */
export function dialable(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}
