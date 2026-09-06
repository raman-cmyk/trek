import { createAdminClient } from "~/lib/supabase.server";
import { sendEmail as send } from "~/lib/email/send.server";
import type { EmailBlock, EmailContent } from "~/lib/email/render";

/**
 * Notifications (docs/02 §Notifications matrix). Email via Resend, SMS to
 * guides via Sparrow.
 *
 * This used to be the whole email system: four lines that either logged or
 * fired a fetch and swallowed the answer. It is now a thin adapter over
 * app/lib/email/send.server.ts, so every existing caller — thirteen notify*
 * functions written over several milestones — got HTML, a real from-address,
 * consent checks, retries and a row in email_log without a single call site
 * changing.
 *
 * New notifications should call sendRichEmail directly and lay their content
 * out in blocks. This plain-text door stays for the ones already written.
 */

/** A subject line turned into a stable-ish key for the log and for dedupe. */
function kindFromSubject(subject: string): string {
  return (
    subject
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 40) || "email"
  );
}

/**
 * Turn a plain-text body into blocks. Blank lines separate paragraphs; a line
 * that is only a URL becomes a button; "  - " lines become a list. This is
 * how the existing messages, all written as text, come out looking composed
 * rather than pasted.
 */
function blocksFromText(body: string): EmailBlock[] {
  const out: EmailBlock[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length) {
      out.push({ list: bullets });
      bullets = [];
    }
  };

  for (const raw of body.split(/\n{2,}/)) {
    const chunk = raw.trim();
    if (!chunk) continue;

    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (/^[-•*]\s+/.test(line)) {
        bullets.push(line.replace(/^[-•*]\s+/, ""));
        continue;
      }
      flush();
      // A line that is nothing but a link is the call to action.
      const bare = line.match(/^(https?:\/\/\S+)$/);
      if (bare) {
        out.push({ button: { label: "Open it", url: bare[1] } });
        continue;
      }
      // "Label: https://…" — use the label on the button.
      const labelled = line.match(/^(.{2,40}?):\s*(https?:\/\/\S+)$/);
      if (labelled) {
        out.push({ button: { label: labelled[1].trim(), url: labelled[2] } });
        continue;
      }
      // AN ALL-CAPS LINE is a section heading in the existing copy.
      if (/^[A-Z][A-Z —'’-]{4,}$/.test(line)) {
        out.push({ h: line });
        continue;
      }
      out.push({ p: line });
    }
  }
  flush();
  return out;
}

/**
 * The original signature, kept so nothing that already calls it has to change.
 * Everything it sends is transactional — the thirteen existing notifications
 * are all about a booking, an enquiry or a verification, none of them
 * marketing.
 */
export async function sendEmail(
  env: Env,
  to: string | null | undefined,
  subject: string,
  body: string,
  opts?: { kind?: string; userId?: string | null; about?: { type: string; id: string } },
): Promise<void> {
  if (!to) return;
  const blocks = blocksFromText(body);
  const content: EmailContent = {
    // The line a mail client shows beside the subject. Taken from the first
    // real sentence rather than left for the client to guess.
    preheader: blocks.find((b) => b.p)?.p?.slice(0, 120) ?? subject,
    heading: subject,
    blocks,
  };
  await send(env, createAdminClient(env), {
    kind: opts?.kind ?? kindFromSubject(subject),
    to,
    userId: opts?.userId ?? null,
    subject,
    content,
    category: "transactional",
    about: opts?.about,
  });
}

/** Compose an email properly, in blocks. Preferred for anything new. */
export { sendEmail as sendRichEmail } from "~/lib/email/send.server";

export async function sendGuideSms(
  env: Env,
  toPhone: string | null | undefined,
  text: string,
): Promise<void> {
  if (!toPhone) return;
  if (!env.SPARROW_SMS_TOKEN) {
    console.log(`[sms:stub] → ${toPhone}`);
    return;
  }
  // Sparrow SMS is called from a Supabase edge function in production; wired
  // when the token exists.
  await fetch("https://api.sparrowsms.com/v2/sms/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: env.SPARROW_SMS_TOKEN, to: toPhone, text }),
  }).catch(() => {});
}
