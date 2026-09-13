/**
 * The rules for choosing a password, in one place.
 *
 * Three screens set one — signing up, resetting a forgotten one, and the
 * office setting one for somebody who rang in — and three different opinions
 * about what counts as good enough is how a person ends up with a password
 * one screen accepts and another rejects.
 */

export const PASSWORD_MIN = 8;

/**
 * Why this password cannot be used — or null if it can.
 *
 * Deliberately short on rules. A length floor catches the genuinely careless;
 * demanding a capital, a digit and a symbol mostly produces `Password1!` and a
 * note on the fridge. The confirmation field is checked here too, because
 * "they do not match" is the same kind of answer and belongs in the same
 * sentence-writing place.
 */
export function passwordProblem(password: string, confirm?: string): string | null {
  const pw = password ?? "";
  if (pw.length < PASSWORD_MIN) {
    return `Use at least ${PASSWORD_MIN} characters.`;
  }
  if (confirm !== undefined && pw !== confirm) {
    return "Those two passwords are not the same.";
  }
  return null;
}

/**
 * What we say after someone asks for a reset link.
 *
 * The same words whether or not that address has an account. Saying "no
 * account with that email" confirms to anybody who asks whether a given
 * person is on this platform — which, for a trekker, is a fact about where
 * they are going and who with.
 */
export function resetSentMessage(email: string): string {
  const at = (email ?? "").trim();
  return at
    ? `If ${at} has an account, a link to set a new password is on its way. It lasts an hour.`
    : "If that address has an account, a link to set a new password is on its way. It lasts an hour.";
}

/** A same-site path, or null. Never let a reset bounce to another domain. */
export function safeNextPath(raw: string | null | undefined): string | null {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
}
