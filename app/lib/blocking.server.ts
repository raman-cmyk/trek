import type { SupabaseClient } from "@supabase/supabase-js";
import { banDurationFor, guideStatusWhileBlocked, type BlockKind } from "./blocking";

/**
 * The block, if any, keeping somebody out right now. Asked on every signed-in
 * request, so it is one indexed query and nothing else.
 */
export async function activeBlockFor(admin: SupabaseClient, userId: string) {
  const { data } = await admin
    .from("account_blocks")
    .select("id, kind, reason, ends_at, starts_at")
    .eq("user_id", userId)
    .is("lifted_at", null)
    .or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data ?? null) as {
    id: string;
    kind: BlockKind;
    reason: string;
    ends_at: string | null;
    starts_at: string;
  } | null;
}

export type BlockOutcome =
  | { ok: true; name: string }
  | { ok: false; error: "not_found" | "self" | "failed" };

/**
 * Block somebody. Any block already open on them is lifted first with a note,
 * so the history reads as what happened rather than two overlapping rows.
 *
 * A guide's public status is changed too and remembered, because a
 * suspended guide who is still "verified" would still be bookable.
 */
export async function blockUser(
  admin: SupabaseClient,
  opts: {
    userId: string;
    kind: BlockKind;
    reason: string;
    endsAt: string | null;
    byId: string;
    replaceNote?: string;
  },
): Promise<BlockOutcome> {
  if (opts.userId === opts.byId) return { ok: false, error: "self" };
  const { data: person } = await admin
    .from("users")
    .select("id, full_name, role")
    .eq("id", opts.userId)
    .maybeSingle();
  if (!person) return { ok: false, error: "not_found" };

  const now = new Date().toISOString();
  const endsAt = opts.kind === "banned" ? null : opts.endsAt;

  // Carry the guide's original status across a replaced block, so lifting a
  // ban that replaced a suspension still puts "verified" back.
  const { data: open } = await admin
    .from("account_blocks")
    .select("id, prior_guide_status")
    .eq("user_id", opts.userId)
    .is("lifted_at", null)
    .maybeSingle();

  let priorGuideStatus: string | null = open?.prior_guide_status ?? null;
  if (person.role === "guide" && !open) {
    const { data: g } = await admin
      .from("guides")
      .select("status")
      .eq("user_id", opts.userId)
      .maybeSingle();
    priorGuideStatus = g?.status ?? null;
  }

  if (open) {
    await admin
      .from("account_blocks")
      .update({
        lifted_at: now,
        lifted_by: opts.byId,
        lift_note: opts.replaceNote ?? "Replaced by a new block",
      })
      .eq("id", open.id);
  }

  const { error } = await admin.from("account_blocks").insert({
    user_id: opts.userId,
    kind: opts.kind,
    reason: opts.reason,
    starts_at: now,
    ends_at: endsAt,
    blocked_by: opts.byId,
    prior_guide_status: priorGuideStatus,
  });
  if (error) {
    console.error("could not insert block", error.message);
    return { ok: false, error: "failed" };
  }

  if (person.role === "guide") {
    await admin
      .from("guides")
      .update({ status: guideStatusWhileBlocked(opts.kind) })
      .eq("user_id", opts.userId);
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(opts.userId, {
    ban_duration: banDurationFor(opts.kind, endsAt),
  });
  if (authErr) console.error("could not ban auth user", authErr.message);

  return { ok: true, name: person.full_name };
}

/** Lift whatever block is open on somebody and put a guide's status back. */
export async function unblockUser(
  admin: SupabaseClient,
  opts: { userId: string; byId: string; note?: string },
): Promise<BlockOutcome> {
  const { data: person } = await admin
    .from("users")
    .select("id, full_name, role")
    .eq("id", opts.userId)
    .maybeSingle();
  if (!person) return { ok: false, error: "not_found" };

  const { data: open } = await admin
    .from("account_blocks")
    .select("id, prior_guide_status")
    .eq("user_id", opts.userId)
    .is("lifted_at", null)
    .maybeSingle();

  if (open) {
    await admin
      .from("account_blocks")
      .update({
        lifted_at: new Date().toISOString(),
        lifted_by: opts.byId,
        lift_note: opts.note?.trim() || null,
      })
      .eq("id", open.id);
    if (person.role === "guide" && open.prior_guide_status) {
      await admin
        .from("guides")
        .update({ status: open.prior_guide_status })
        .eq("user_id", opts.userId);
    }
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(opts.userId, {
    ban_duration: "none",
  });
  if (authErr) console.error("could not unban auth user", authErr.message);

  return { ok: true, name: person.full_name };
}
