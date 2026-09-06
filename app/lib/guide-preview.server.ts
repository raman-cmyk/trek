import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createSupabaseServerClient } from "~/lib/supabase.server";

/**
 * A guide looking at their own page before it is live.
 *
 * public_guides only contains verified guides, so /guides/<slug> returned a
 * 404 for everybody still in review — which is exactly the guide who most
 * needs to see the page they are being asked to fill in. They were writing a
 * bio, choosing a portrait and picking regions with no way to look at the
 * result until the office let them through.
 *
 * This returns the same shape public_guides would have produced, but only for
 * the signed-in owner of that slug. Nobody else can see an unverified page:
 * the check is the session's own user id against guides.user_id, not anything
 * passed in from the request.
 */
export async function guidePreviewForOwner(
  request: Request,
  env: Env,
  slug: string,
): Promise<{ guide: Record<string, any>; admin: SupabaseClient } | null> {
  const { supabase } = createSupabaseServerClient(request, env);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient(env);
  const { data: g } = await admin
    .from("guides")
    .select(
      "user_id, slug, status, tier, home_district, regions, hook_line, bio, voice_intro_url, years_experience, day_rate_usd_cents, response_rate, median_response_mins, treks_completed_platform, created_at, updated_at, porter_welfare, gender, only_with_me, users(full_name, avatar_url)",
    )
    .eq("slug", slug)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!g) return null;

  const u = (g as any).users ?? {};
  // public_guides shows first names only (0042). The preview must lie about
  // nothing, including that.
  const firstName = String(u.full_name ?? "").trim().split(/\s+/)[0] ?? "";

  const { users: _drop, ...rest } = g as any;
  return { guide: { ...rest, full_name: firstName, avatar_url: u.avatar_url ?? null }, admin };
}
