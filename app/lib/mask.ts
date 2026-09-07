/**
 * Contact masking for messages (docs/02 §Security, docs/01 F5).
 *
 * Pre-deposit, phone numbers and emails are masked in rendered message bodies
 * (the original is stored; the masked version is shown). Off-platform
 * solicitation keywords are flagged to the ops monitor. The `flaggedReason`
 * maps to messages.flagged_reason: 'phone' | 'email' | 'platform_bypass'.
 */

export type FlagReason = "phone" | "email" | "platform_bypass";

// Emails: simple, permissive — err toward masking pre-deposit.
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Phone-ish: an optional +, then a run of digits/separators totalling >= 8
// digits, so dates/prices ("14 Oct", "$360") aren't masked.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;

// A whole http(s) link, so it can be stepped over rather than masked. A photo
// shared in a thread is a link whose path is a user id and a timestamp — all
// digits — and masking those digits did not hide a phone number, it destroyed
// the picture. Nobody could send or receive one.
const URL_RE = /https?:\/\/\S+/g;

// Off-platform solicitation keywords.
const BYPASS_RE =
  /\b(whats\s?app|viber|telegram|signal|wechat|imo|line app|off[-\s]?platform|directly|cash only)\b/i;

function digitCount(s: string): number {
  return (s.match(/\d/g) || []).length;
}

export interface MaskResult {
  /** Body with emails and phone numbers replaced by placeholders. */
  rendered: string;
  /** Primary flag for ops (precedence phone > email > platform_bypass), or null. */
  flaggedReason: FlagReason | null;
}

/**
 * Masks contact info in a message body and returns the ops flag (if any).
 * Precedence when several match: phone > email > platform_bypass — a shared
 * number is the strongest bypass signal.
 */
export function maskMessage(body: string): MaskResult {
  let sawEmail = false;
  let sawPhone = false;

  const maskRun = (run: string) => {
    let out = run.replace(EMAIL_RE, () => {
      sawEmail = true;
      return "[email hidden]";
    });
    out = out.replace(PHONE_RE, (m) => {
      if (digitCount(m) >= 8) {
        sawPhone = true;
        return "[number hidden]";
      }
      return m;
    });
    return out;
  };

  // Mask the prose between the links, and copy the links through untouched.
  // A link is not a way to leak a number that the bypass flag below does not
  // already catch, and it is the only way to send a photo.
  let rendered = "";
  let last = 0;
  URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(body); m; m = URL_RE.exec(body)) {
    rendered += maskRun(body.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  rendered += maskRun(body.slice(last));

  const sawBypass = BYPASS_RE.test(body);

  const flaggedReason: FlagReason | null = sawPhone
    ? "phone"
    : sawEmail
      ? "email"
      : sawBypass
        ? "platform_bypass"
        : null;

  return { rendered, flaggedReason };
}

/** True if the body contains any contact info or bypass keyword. */
export function containsContactInfo(body: string): boolean {
  return maskMessage(body).flaggedReason !== null;
}
