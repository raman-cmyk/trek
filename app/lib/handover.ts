/**
 * Getting a person their sign-in details, and getting a guide to a human.
 *
 * The office can set somebody's password, and then the details sit on a screen
 * in Kathmandu while the person who needs them is in Namche. Copying two
 * fields into WhatsApp by hand is where a wrong character comes from, and a
 * wrong character on a password you cannot see is an unwinnable afternoon.
 *
 * WhatsApp rather than email, because that is the channel: most guides here
 * have a phone and no inbox, which is the same reason the whole notification
 * layer reaches them by SMS.
 *
 * The password IS in the message. That is a deliberate call, not an oversight:
 * the office is already reading it off a screen and typing it into a chat, so
 * the choice is between a message we composed carefully and one they typed in
 * a hurry. What the message can do is say it is temporary, tell them to change
 * it, and tell them to delete the message — which a hand-typed one never does.
 */

import { BRAND } from "~/lib/brand";

/** Just the digits, with the country code, as wa.me wants them. */
export function waNumber(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  // A Nepali mobile typed without its country code: 98… is ten digits.
  if (digits.length === 10 && digits.startsWith("9")) return `977${digits}`;
  return digits;
}

/** A wa.me link, or null when there is no number to open it with. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const to = waNumber(phone);
  if (!to) return null;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}

export interface Credentials {
  name: string;
  email: string | null;
  password: string;
  loginUrl: string;
}

/**
 * The message itself.
 *
 * Short, because it is read on a phone with one bar of signal, and it says the
 * three things a hand-typed message forgets: it is temporary, change it, and
 * delete this.
 */
export function credentialsMessage(c: Credentials): string {
  const who = (c.name ?? "").split(" ")[0] || "there";
  return [
    `Namaste ${who} — it's ${BRAND}.`,
    "",
    "We've set a temporary password on your account:",
    c.email ? `Email: ${c.email}` : null,
    `Password: ${c.password}`,
    "",
    `Sign in here: ${c.loginUrl}`,
    "",
    "Please change it once you're in, and delete this message.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

/** A mailto: link for the same message — for the people who do have an inbox. */
export function credentialsMailto(c: Credentials): string | null {
  if (!c.email) return null;
  const subject = `Your ${BRAND} sign-in`;
  return `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(credentialsMessage(c))}`;
}

/**
 * The guide's own "talk to a person" link.
 *
 * A guide stuck at 4am before a Lukla flight does not want a form. The number
 * is configured rather than hardcoded, and when it is not set the link is not
 * drawn at all — a support button that opens nothing is worse than no button.
 */
export function supportLink(
  supportPhone: string | null | undefined,
  opts: { name?: string | null; about?: string | null } = {},
): string | null {
  const who = (opts.name ?? "").split(" ")[0];
  const text = [
    `Namaste — it's ${who || "a guide"} from ${BRAND}.`,
    opts.about ? `About: ${opts.about}` : null,
    "",
  ]
    .filter((l) => l !== null)
    .join("\n");
  return whatsappLink(supportPhone, text);
}
