import { redirect } from "react-router";
import type { Route } from "./+types/ops.users.enter";
import { getProfile } from "~/lib/auth.server";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { homePathFor } from "~/lib/super-admin";

/**
 * The far end of "Open as them" on /ops/users.
 *
 * The super admin minted a one-time token for somebody's account; this trades
 * it for a session in whichever browser opens it, and sends them where that
 * person would land. It sits outside the ops layout on purpose: the moment
 * the token is verified this browser IS that person, and the ops layout
 * would bounce a trekker straight back to /ops/login.
 *
 * The token is the credential — single use, an hour's life, made only by the
 * super admin — which is the same trust a magic link in an email carries.
 */
export function meta() {
  return [{ title: "Signing in…" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const token = new URL(request.url).searchParams.get("token_hash") ?? "";
  if (!token) return { error: "No link here." };

  const { supabase, headers } = createSupabaseServerClient(request, env);
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error || !data.user) {
    return {
      error:
        "That link has been used already, or it has expired. Make a new one from Everyone's logins.",
    };
  }
  const profile = await getProfile(env, data.user.id);
  throw redirect(homePathFor(profile?.role), { headers });
}

export default function Enter({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="font-display text-2xl text-ink">Couldn't sign in</h1>
      <p className="mt-2 text-ink-soft">{loaderData.error}</p>
    </main>
  );
}
