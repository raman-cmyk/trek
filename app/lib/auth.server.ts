import { redirect } from "react-router";
import { createSupabaseServerClient, createAdminClient } from "~/lib/supabase.server";
import { activeBlock, blockMessage } from "~/lib/moderation";

export interface SessionUser {
  id: string;
  email?: string;
  phone?: string;
}

/** The signed-in Supabase auth user, or null. Returns the cookie headers too. */
export async function getSessionUser(request: Request, env: Env) {
  const { supabase, headers } = createSupabaseServerClient(request, env);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { user: (user as SessionUser | null) ?? null, supabase, headers };
}

/** The user's app profile (role, name) from public.users, via the admin client. */
export async function getProfile(env: Env, userId: string) {
  const admin = createAdminClient(env);
  const { data } = await admin
    .from("users")
    .select("id, role, full_name, email, phone")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

/**
 * Require a signed-in user (optionally of a given role). Redirects to the right
 * login when missing. Returns the user + profile + admin client.
 */
export async function requireUser(
  request: Request,
  env: Env,
  role?: "trekker" | "guide" | "ops",
) {
  const { user, headers } = await getSessionUser(request, env);
  const loginPath = role === "guide" ? "/g/login" : "/login";
  if (!user) throw redirect(loginPath, { headers });
  const profile = await getProfile(env, user.id);
  if (!profile) throw redirect(loginPath, { headers });
  if (role && profile.role !== role) throw redirect(loginPath, { headers });
  const admin = createAdminClient(env);
  // A ban that lets you carry on signing in is not a ban. Checked on every
  // signed-in request rather than only at the login screen, because somebody
  // suspended at ten in the morning has a session cookie that would otherwise
  // last them the week.
  // Ops is exempt, stated here rather than left to the fact that requireOps
  // happens not to come through this function. Locking the office out of the
  // console with a moderation action taken in the console is a way to lose
  // the platform on a Friday afternoon.
  if (profile.role !== "ops") {
    const stop = await blockedNow(admin, user.id);
    if (stop) throw redirect(`/suspended?why=${encodeURIComponent(stop)}`, { headers });
  }
  return { user, profile, headers, admin };
}

/**
 * Ensure a public.users row exists for a freshly-authenticated trekker (their
 * profile is created on first login; guides are created at application time).
 */
export async function ensureTrekkerProfile(
  env: Env,
  user: SessionUser,
  fullName?: string,
  countryCode?: string,
) {
  const admin = createAdminClient(env);
  const { data: existing } = await admin
    .from("users")
    .select("id, full_name, country_code")
    .eq("id", user.id)
    .maybeSingle();
  const country = countryCode?.trim().slice(0, 2).toUpperCase() || null;
  if (existing) {
    // Backfill name/country if onboarding collected them after a bare login.
    const patch: Record<string, unknown> = {};
    if (fullName && !existing.full_name) patch.full_name = fullName;
    if (country && !existing.country_code) patch.country_code = country;
    if (Object.keys(patch).length) await admin.from("users").update(patch).eq("id", user.id);
    return;
  }
  await admin.from("users").insert({
    id: user.id,
    role: "trekker",
    email: user.email ?? null,
    phone: user.phone ?? null,
    full_name: fullName || user.email?.split("@")[0] || "Trekker",
    country_code: country,
  });
}

/**
 * The reason this account cannot be used right now, or null.
 *
 * Callers decide who to apply it to; requireUser exempts ops.
 */
export async function blockedNow(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("account_blocks")
    .select("kind, reason, starts_at, ends_at, lifted_at")
    .eq("user_id", userId)
    .is("lifted_at", null)
    .neq("kind", "warned")
    .order("created_at", { ascending: false })
    .limit(5);
  // A failure to READ the block list must never lock anybody out: the safe
  // direction here is letting people in, not shutting the platform.
  if (error) return null;
  const now = new Date().toISOString();
  const active = activeBlock((data ?? []) as any, now);
  return active ? blockMessage(active, now) : null;
}
