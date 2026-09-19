import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "~/lib/site-url";
import { sendEmail, sendGuideSms } from "~/lib/notify.server";
import {
  actionProblem,
  suspensionEnd,
  type ActionKind,
} from "~/lib/moderation";

/**
 * Taking the action, and making it mean something.
 *
 * A "ban" that writes a row and lets the person carry on signing in is
 * theatre, and the office would find out it was theatre at the worst possible
 * moment. So this does the three things that have to happen together: it
 * writes the decision down with a name against it, it takes the guide's work
 * off the marketplace where the action restricts them, and it tells the person
 * what was done and why.
 */

export interface TakeActionArgs {
  userId: string;
  kind: ActionKind;
  reason: string;
  /** Only for a suspension. */
  days?: number | null;
  /** The ops account doing it. */
  byId: string;
}

export async function takeAction(
  env: Env,
  admin: SupabaseClient,
  args: TakeActionArgs,
): Promise<{ error?: string; ok?: string }> {
  const problem = actionProblem(args.kind, args.reason, args.days);
  if (problem) return { error: problem };

  const reason = args.reason.trim();
  const now = new Date().toISOString();
  const restricts = args.kind !== "warned";

  const { data: person } = await admin
    .from("users")
    .select("id, role, full_name, email, phone")
    .eq("id", args.userId)
    .maybeSingle();
  if (!person) return { error: "No such account." };

  // One restriction open at a time. The database enforces this too (a partial
  // unique index), but hitting it raises a constraint error nobody can read.
  if (restricts) {
    const { data: open } = await admin
      .from("account_blocks")
      .select("kind")
      .eq("user_id", args.userId)
      .is("lifted_at", null)
      .neq("kind", "warned")
      .maybeSingle();
    if (open) {
      return {
        error: `This account is already ${open.kind}. Lift that first if you mean to change it.`,
      };
    }
  }

  // A suspended guide's listings come down with them. Remembered rather than
  // assumed, so lifting puts them back where they were — a guide who was in
  // review before should not come back verified.
  let priorGuideStatus: string | null = null;
  if (restricts && person.role === "guide") {
    const { data: g } = await admin
      .from("guides")
      .select("status")
      .eq("user_id", args.userId)
      .maybeSingle();
    priorGuideStatus = g?.status ?? null;
    await admin
      .from("guides")
      .update({ status: args.kind === "banned" ? "removed" : "suspended" })
      .eq("user_id", args.userId);
    await admin
      .from("offerings")
      .update({
        status: "paused",
        paused_reason: `Account ${args.kind}: ${reason}`,
        paused_at: now,
        paused_by: args.byId,
      })
      .eq("guide_id", args.userId)
      .eq("status", "live");
  }

  const { error } = await admin.from("account_blocks").insert({
    user_id: args.userId,
    kind: args.kind,
    reason,
    starts_at: now,
    ends_at: args.kind === "suspended" ? suspensionEnd(args.days as number, now) : null,
    blocked_by: args.byId,
    prior_guide_status: priorGuideStatus,
  });
  if (error) return { error: error.message };

  await tell(env, admin, { person, kind: args.kind, reason, days: args.days ?? null });

  return {
    ok:
      args.kind === "warned"
        ? "Warning sent. It is on their record."
        : args.kind === "banned"
          ? "Banned. They cannot sign in, and their listings are down."
          : `Suspended for ${args.days} days. They cannot sign in until it lifts.`,
  };
}

/**
 * Letting somebody back in.
 *
 * Restores the guide's status to what it was rather than to "verified",
 * because the alternative quietly promotes anybody who was suspended while
 * still in review.
 */
export async function liftBlock(
  env: Env,
  admin: SupabaseClient,
  args: { blockId: string; byId: string; note?: string },
): Promise<{ error?: string; ok?: string }> {
  const { data: block } = await admin
    .from("account_blocks")
    .select("id, user_id, kind, prior_guide_status, lifted_at")
    .eq("id", args.blockId)
    .maybeSingle();
  if (!block) return { error: "No such block." };
  if (block.lifted_at) return { error: "That one is already lifted." };

  await admin
    .from("account_blocks")
    .update({
      lifted_at: new Date().toISOString(),
      lifted_by: args.byId,
      lift_note: (args.note ?? "").trim().slice(0, 500) || null,
    })
    .eq("id", block.id);

  if (block.prior_guide_status) {
    await admin
      .from("guides")
      .update({ status: block.prior_guide_status })
      .eq("user_id", block.user_id);
  }

  // Listings are NOT put back automatically. They were paused with a reason
  // the guide can read, and a guide coming back should look at their own
  // listings before they are selling again.
  const { data: person } = await admin
    .from("users")
    .select("id, role, full_name, email, phone")
    .eq("id", block.user_id)
    .maybeSingle();
  if (person) {
    const url = `${siteUrl(env)}${person.role === "guide" ? "/g" : "/trips"}`;
    if (person.email) {
      await sendEmail(
        env,
        person.email,
        "Your account is open again",
        `Your account has been reopened and you can sign in.\n\n${
          person.role === "guide"
            ? "Your listings are paused — open each one and put it back live when you are ready:"
            : "Pick up where you left off:"
        }\n${url}`,
        { kind: "account_reopened" },
      );
    }
    if (person.role === "guide") {
      await sendGuideSms(
        env,
        person.phone,
        `Guides of Nepal: your account is open again. Your trips are paused — put them back live: ${url}`,
      );
    }
  }
  return { ok: "Lifted. They can sign in again." };
}

/**
 * Telling somebody what was done to them.
 *
 * The reason goes out verbatim. An action somebody cannot understand is one
 * they cannot correct, and the commonest flagged message on this platform is
 * a guide being helpful in the wrong way.
 */
async function tell(
  env: Env,
  _admin: SupabaseClient,
  args: {
    person: { role: string | null; email: string | null; phone: string | null };
    kind: ActionKind;
    reason: string;
    days: number | null;
  },
) {
  const { person, kind, reason, days } = args;
  const isGuide = person.role === "guide";
  const help = `If you think this is wrong, reply to this email and a person will read it.`;

  const subject =
    kind === "warned"
      ? "A note about your messages"
      : kind === "banned"
        ? "Your account has been closed"
        : "Your account has been suspended";

  const body =
    kind === "warned"
      ? `We had to step in on something you sent.\n\nWhy:\n${reason}\n\nNothing has been restricted — your account works as before. We are telling you so it does not happen again.\n\n${help}`
      : kind === "banned"
        ? `Your account has been closed and you can no longer sign in.\n\nWhy:\n${reason}\n\n${help}`
        : `Your account is suspended for ${days} days. You cannot sign in until it lifts.\n\nWhy:\n${reason}\n\n${help}`;

  if (person.email) {
    await sendEmail(env, person.email, subject, body, { kind: `account_${kind}` });
  }
  if (isGuide) {
    await sendGuideSms(
      env,
      person.phone,
      kind === "warned"
        ? `Guides of Nepal: a note about your messages — ${reason.slice(0, 80)}. Check your email.`
        : kind === "banned"
          ? `Guides of Nepal: your account has been closed. Check your email for why.`
          : `Guides of Nepal: your account is suspended for ${days} days. Check your email for why.`,
    );
  }
}
