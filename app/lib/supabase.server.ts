import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { redirect, type RouterContextProvider } from "react-router";
import { cloudflareContext } from "~/context";

/** Read the Cloudflare env off the request's load context. */
export function getEnv(context: Readonly<RouterContextProvider>): Env {
  return context.get(cloudflareContext).env;
}

/**
 * Cookie-bound server client for AUTH (uses the anon key + the user's session
 * cookies). Returns the client plus a `headers` object accumulating any
 * Set-Cookie the session refresh emits — attach it to the response.
 */
export function createSupabaseServerClient(request: Request, env: Env) {
  const headers = new Headers();
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("Cookie") ?? "").map(
          (c) => ({ name: c.name, value: c.value ?? "" }),
        );
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          headers.append(
            "Set-Cookie",
            serializeCookieHeader(name, value, options),
          );
        }
      },
    },
  });
  return { supabase, headers };
}

/**
 * Privileged client using the service-role key. Bypasses RLS — server-only,
 * for ops reads/writes where the operator legitimately sees everything.
 * Never expose this to the browser.
 */
export function createAdminClient(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface OpsSession {
  user: { id: string; email?: string };
  profile: { role: string; full_name: string };
  admin: SupabaseClient;
  /** Set-Cookie headers from any session refresh — merge into the response. */
  headers: Headers;
}

/**
 * Role gate for /ops (docs/05 M2). Redirects to /ops/login unless the caller is
 * a signed-in user whose users.role = 'ops'. Returns an admin client for the
 * loader/action to use.
 */
export async function requireOps(
  request: Request,
  env: Env,
): Promise<OpsSession> {
  const { supabase, headers } = createSupabaseServerClient(request, env);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw redirect("/ops/login", { headers });

  const admin = createAdminClient(env);
  const { data: profile } = await admin
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "ops") {
    throw redirect("/ops/login", { headers });
  }
  return { user, profile, admin, headers };
}
