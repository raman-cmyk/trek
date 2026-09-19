import type { Route } from "./+types/api.webhooks.resend";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import {
  providerIdOf,
  recipientOf,
  resendOutcome,
  verifySvixSignature,
  type ResendEvent,
} from "~/lib/resend-events";

/**
 * Resend's side of the conversation.
 *
 * We have always been able to send. Until now we could not hear anything back,
 * so `users.email_blocked_at` — which the gate has honoured since 0055 — was a
 * column nothing ever wrote. A dead address stayed on the list forever, and
 * mailing dead addresses is exactly how a young sending domain ends up in spam
 * folders, taking the booking receipts with it.
 *
 * Thin on purpose: every judgement lives in `~/lib/resend-events`, which is
 * pure and tested. This reads, verifies, and writes.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const secret = (env as { RESEND_WEBHOOK_SECRET?: string }).RESEND_WEBHOOK_SECRET;
  // No secret means no way to tell Resend from anyone else who found the URL.
  // Refuse rather than trust, the same way the Stripe webhook does.
  if (!secret) return new Response("not found", { status: 404 });

  const body = await request.text();
  const ok = await verifySvixSignature(
    body,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );
  if (!ok) return new Response("bad signature", { status: 400 });

  let event: ResendEvent;
  try {
    event = JSON.parse(body) as ResendEvent;
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const outcome = resendOutcome(event);
  if (outcome.do === "ignore") return json({ received: true });

  const admin = createAdminClient(env);

  if (outcome.do === "block") {
    const to = recipientOf(event);
    // A lead with no account can bounce too; there is simply no row to mark.
    if (!to) return json({ received: true });
    const { error } = await admin
      .from("users")
      .update({ email_blocked_at: new Date().toISOString(), email_blocked_reason: outcome.reason })
      .eq("email", to);
    // Looked at, not fired and forgotten — a block that silently fails to
    // write is the bug this whole route exists to end.
    if (error) console.error("[resend] could not block address", outcome.reason, error.message);
    return json({ received: true, blocked: !error });
  }

  // Not the send itself, which `record()` already logged — this is the
  // delivery verdict that arrives afterwards, and it is the only way to tell
  // "Resend accepted it" from "a person actually received it".
  const providerId = providerIdOf(event);
  if (providerId) {
    const { error } = await admin
      .from("email_log")
      .update({ status: outcome.status, detail: outcome.detail })
      .eq("provider_id", providerId);
    if (error) console.error("[resend] could not update email_log", error.message);
  }
  return json({ received: true });
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
  });
}

/** Webhooks are POST-only. */
export function loader() {
  return new Response("Method not allowed", { status: 405 });
}
