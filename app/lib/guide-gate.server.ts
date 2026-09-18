/**
 * What a guide may do before the office has checked them.
 *
 * The rule used to be "everything, because publishing is gated anyway" — an
 * offering is born `pending` and an ops person flips it live, so nothing an
 * unverified guide typed could reach the public site. That reasoning is sound
 * and it was still the wrong answer: somebody who had done nothing but fill in
 * a form was handed a listing builder, which reads as "you are in". The
 * founder watched it happen to a stranger and said so.
 *
 * So the door is shut until the papers are checked. The screen behind it says
 * what is outstanding rather than just refusing, because an applicant staring
 * at a locked page with no reason is how a good guide decides we are not
 * serious.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type GuideStanding = "verified" | "waiting" | "stopped" | "none";

export interface GuideGate {
  standing: GuideStanding;
  /** Their `guides.status`, for a screen that wants to be specific. */
  status: string | null;
  /** May they build and edit listings? */
  canList: boolean;
}

/**
 * Where this guide stands.
 *
 * `suspended` and `removed` are not "waiting" — nothing they do will change it
 * today, and telling them to sit tight would be a lie.
 */
export async function guideGate(
  admin: SupabaseClient,
  userId: string,
): Promise<GuideGate> {
  const { data } = await admin
    .from("guides")
    .select("status")
    .eq("user_id", userId)
    .maybeSingle();
  const status = (data?.status as string | undefined) ?? null;
  if (!status) return { standing: "none", status, canList: false };
  if (status === "verified") return { standing: "verified", status, canList: true };
  if (status === "suspended" || status === "removed") {
    return { standing: "stopped", status, canList: false };
  }
  return { standing: "waiting", status, canList: false };
}

/** What the office is still waiting on, in the guide's own words. */
export async function outstandingChecks(
  admin: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("guide_verifications")
    .select("check_type, status")
    .eq("guide_id", userId);
  const { CHECK_LABELS } = await import("~/lib/guide-checks");
  return (data ?? [])
    .filter((c: any) => c.status === "pending")
    .map((c: any) => (CHECK_LABELS as Record<string, string>)[c.check_type] ?? c.check_type);
}
