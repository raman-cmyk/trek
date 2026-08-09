/**
 * Notifications (docs/02 §Notifications matrix). Email via Resend, SMS to guides
 * via Sparrow. Until the founder adds keys, these log to the console (never any
 * PII beyond the recipient handle) so the flow is complete and swappable.
 */
export async function sendEmail(
  env: Env,
  to: string | null | undefined,
  subject: string,
  body: string,
): Promise<void> {
  if (!to) return;
  if (!env.RESEND_API_KEY) {
    console.log(`[email:stub] → ${to} · ${subject}`);
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Trek <no-reply@trek.example>",
      to,
      subject,
      text: body,
    }),
  }).catch(() => {});
}

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
