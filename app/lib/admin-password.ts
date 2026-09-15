/**
 * Setting somebody else's password, by hand.
 *
 * Ops could already mint a random password for an account. What it could not
 * do is set a CHOSEN one — and that is the case that actually comes up: a
 * guide on a phone in Namche, on a call, who needs something they can type
 * now and remember for ten minutes. Reading out
 * "juniper-lantern-marigold-4417" over a bad line is not that.
 *
 * This is the most dangerous button on the site, so the rules are deliberate:
 *
 *  - It belongs to the super admin alone, not to ops as a role. Ops is a job;
 *    this is the ability to become any user on the platform.
 *  - The password is never written to a log, an audit row, an error message
 *    or a notification. The audit records THAT it happened, by whom, to whom,
 *    and when — never the secret itself.
 *  - It is checked for the failures that actually happen when a human types a
 *    password into an admin box in a hurry: too short, all one character, or
 *    one of the handful of words people reach for when they think it is
 *    temporary. "Temporary" passwords are the ones that live for two years.
 */

export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 200;

/**
 * The passwords people actually type into a box labelled "temporary".
 *
 * Not a dictionary — a dictionary check belongs at signup, where the person
 * choosing is the person at risk. This is a short list of the ones an admin
 * in a hurry reaches for, compared after stripping digits and punctuation so
 * "Password123!" is caught by "password".
 */
const LAZY = [
  "password",
  "passw",
  "letmein",
  "welcome",
  "changeme",
  "temporary",
  "temp",
  "qwerty",
  "asdf",
  "abcd",
  "test",
  "guest",
  "admin",
  "trek",
  "guidesofnepal",
  "nepal",
];

export interface PasswordProblem {
  message: string;
}

/** What is wrong with this password, or null if nothing is. */
export function checkPassword(raw: string): PasswordProblem | null {
  const pw = raw ?? "";
  if (pw.length < MIN_PASSWORD) {
    return { message: `Use at least ${MIN_PASSWORD} characters.` };
  }
  if (pw.length > MAX_PASSWORD) {
    return { message: `That is longer than ${MAX_PASSWORD} characters.` };
  }
  if (pw.trim() !== pw) {
    // A trailing space is invisible here and invisible to them, and it is the
    // difference between the password working and not.
    return { message: "Remove the space at the start or end." };
  }
  if (new Set(pw).size < 4) {
    return { message: "That is the same few characters repeated." };
  }
  const bare = pw.toLowerCase().replace(/[^a-z]/g, "");
  if (LAZY.some((w) => bare === w || (bare.startsWith(w) && bare.length - w.length <= 2))) {
    return {
      message: "That is one of the first passwords anybody would guess. Pick another.",
    };
  }
  return null;
}

/**
 * How an admin should describe what they just did, in the audit.
 *
 * Deliberately takes no password argument. A function that cannot see the
 * secret cannot leak it, which is a stronger guarantee than remembering not
 * to pass it.
 */
export function auditNote(
  action: "password_set" | "password_generated" | "entered_account",
  targetName: string,
): string {
  switch (action) {
    case "password_set":
      return `Set a chosen password for ${targetName}`;
    case "password_generated":
      return `Generated a new password for ${targetName}`;
    case "entered_account":
      return `Signed in as ${targetName}`;
  }
}
