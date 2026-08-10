import { redirect } from "react-router";
import { createSupabaseServerClient, createAdminClient } from "~/lib/supabase.server";

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
  return { user, profile, headers, admin: createAdminClient(env) };
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
