import type { SupabaseClient } from "@supabase/supabase-js";
import { renderEmail, type EmailContent } from "~/lib/email/render";
import { BRAND } from "~/lib/brand";

/**
 * One door for every email we send.
 *
 * The old sendEmail was four lines: if there is no key, log; otherwise fetch
 * and swallow whatever comes back. That is fine for a stub and useless the
 * moment real mail matters — nobody could answer "did the guide get told?",
 * a failure looked identical to a success, and nothing stopped an automation
 * mailing the same person every night.
 *
 * Everything now goes through here so that four things are always true:
 *   - marketing mail respects consent, transactional mail ignores it;
 *   - a blocked address is never mailed again, whatever the category;
 *   - every attempt is written to email_log, including the ones we chose not
 *     to send and why;
 *   - a transient failure is retried once rather than lost.
 */

export type EmailCategory = "transactional" | "marketing";

/** Marketing categories a person can opt into individually. */
export type MarketingTopic = "trip_tips" | "guide_news" | "offers";

export interface SendArgs {
  /** The template key. Automations dedupe on this, so keep it stable. */
  kind: string;
  to: string | null | undefined;
  /** Null for someone with no account — a lead, an enquiry from a stranger. */
  userId?: string | null;
  subject: string;
  content: EmailContent;
  category?: EmailCategory;
  /** Required when category is 'marketing'. */
  topic?: MarketingTopic;
  /** What this was about, so ops can find it later. */
  about?: { type: string; id: string };
  replyTo?: string;
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

const TRANSACTIONAL_FROM = `${BRAND} <no-reply@guidesofnepal.com>`;
const MARKETING_FROM = `${BRAND} <hello@guidesofnepal.com>`;
const DEFAULT_REPLY_TO = "hello@guidesofnepal.com";

/**
 * Legally required on marketing mail in the US, and a trust signal everywhere.
 * Replace with the registered address before the first campaign goes out.
 */
const POSTAL_ADDRESS = `${BRAND} · Thamel, Kathmandu, Nepal`;

function siteUrl(env: Env): string {
  return (env.SITE_URL ?? "https://guidesofnepal.com").replace(/\/$/, "");
}

/** Where a person goes to stop receiving this. */
function unsubscribeUrl(env: Env, token: string): string {
  return `${siteUrl(env)}/email/unsubscribe/${token}`;
}

/**
 * Whether we may send this, and what to record if not. Reads the recipient's
 * row once — consent, block state and unsubscribe token all live there.
 */
async function gate(
  admin: SupabaseClient,
  args: SendArgs,
): Promise<{ allow: boolean; reason?: string; token?: string }> {
  if (!args.to) return { allow: false, reason: "no_address" };

  const { data: u } = await admin
    .from("users")
    .select("marketing_consent, email_prefs, email_blocked_at, unsubscribe_token")
    .eq(args.userId ? "id" : "email", args.userId ?? args.to)
    .maybeSingle();

  // A hard bounce or a spam complaint stops everything. Continuing to mail a
  // dead or hostile address is how a sending domain gets blacklisted, and it
  // would take the booking receipts down with it.
  if (u?.email_blocked_at) return { allow: false, reason: "blocked" };

  const token = u?.unsubscribe_token as string | undefined;

  if ((args.category ?? "transactional") === "transactional") {
    // A deposit receipt is not marketing. It sends.
    return { allow: true, token };
  }
  if (!u) return { allow: false, reason: "no_consent" };
  if (!u.marketing_consent) return { allow: false, reason: "no_consent" };
  if (args.topic && !(u.email_prefs ?? []).includes(args.topic)) {
    return { allow: false, reason: "topic_off" };
  }
  return { allow: true, token };
}

async function record(
  admin: SupabaseClient,
  args: SendArgs,
  status: "sent" | "failed" | "skipped",
  detail?: string,
  providerId?: string,
) {
  try {
    await admin.from("email_log").insert({
      user_id: args.userId ?? null,
      to_email: args.to ?? "",
      kind: args.kind,
      subject: args.subject,
      category: args.category ?? "transactional",
      status,
      detail: detail ?? null,
      provider_id: providerId ?? null,
      subject_type: args.about?.type ?? null,
      subject_id: args.about?.id ?? null,
    });
  } catch {
    // A logging failure must never be the reason an email does not go out.
  }
}

/**
 * Send one email. Never throws: a notification that fails must not take down
 * the booking it was telling somebody about.
 */
export async function sendEmail(
  env: Env,
  admin: SupabaseClient,
  args: SendArgs,
): Promise<SendResult> {
  const category = args.category ?? "transactional";

  const g = await gate(admin, args);
  if (!g.allow) {
    await record(admin, args, "skipped", g.reason);
    return { sent: false, reason: g.reason };
  }

  const { html, text } = renderEmail({
    content: args.content,
    // Transactional mail carries no unsubscribe link — offering to stop a
    // booking receipt would be a lie, since we would send it anyway.
    unsubscribeUrl:
      category === "marketing" && g.token ? unsubscribeUrl(env, g.token) : null,
    postalAddress: POSTAL_ADDRESS,
    siteUrl: siteUrl(env),
  });

  if (!env.RESEND_API_KEY) {
    // Still logged, so the ops console shows exactly what would have gone out
    // the moment the key is added.
    console.log(`[email:stub] → ${args.to} · ${args.subject}`);
    await record(admin, args, "skipped", "no_api_key");
    return { sent: false, reason: "no_api_key" };
  }

  const body: Record<string, unknown> = {
    from: category === "marketing" ? MARKETING_FROM : TRANSACTIONAL_FROM,
    to: args.to,
    subject: args.subject,
    html,
    text,
    reply_to: args.replyTo ?? DEFAULT_REPLY_TO,
  };
  // Gmail and Apple Mail render their own unsubscribe button from this, which
  // is what people press instead of the spam button.
  if (category === "marketing" && g.token) {
    body.headers = {
      "List-Unsubscribe": `<${unsubscribeUrl(env, g.token)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json().catch(() => ({}))) as { id?: string };
        await record(admin, args, "sent", undefined, json.id);
        return { sent: true };
      }
      // 4xx is our mistake — a bad address, a rejected domain. Retrying it
      // just sends the same wrong request again.
      if (res.status < 500) {
        const detail = (await res.text().catch(() => "")).slice(0, 300);
        await record(admin, args, "failed", `http_${res.status}: ${detail}`);
        return { sent: false, reason: `http_${res.status}` };
      }
    } catch (e: any) {
      if (attempt === 1) {
        await record(admin, args, "failed", String(e?.message ?? e).slice(0, 300));
        return { sent: false, reason: "network" };
      }
    }
  }
  await record(admin, args, "failed", "retries_exhausted");
  return { sent: false, reason: "retries_exhausted" };
}

/**
 * Has this person already had this email about this thing? The guarantee every
 * automation leans on — a nightly job that re-runs must not mail twice.
 */
export async function alreadySent(
  admin: SupabaseClient,
  args: { userId: string; kind: string; subjectId?: string | null },
): Promise<boolean> {
  let q = admin
    .from("email_log")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", args.userId)
    .eq("kind", args.kind)
    .eq("status", "sent");
  q = args.subjectId ? q.eq("subject_id", args.subjectId) : q.is("subject_id", null);
  const { count } = await q;
  return (count ?? 0) > 0;
}
