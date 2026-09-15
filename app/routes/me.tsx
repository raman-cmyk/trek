import { redirect } from "react-router";
import type { Route } from "./+types/me";
import { getEnv } from "~/lib/supabase.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";

/**
 * "My profile", without putting anybody's id in the page.
 *
 * The trekker profile lives at /trekkers/:id and is the only page on this
 * site that answers "what does a guide see about me?" — and until now
 * nothing linked to it, so the answer was unreachable unless you already
 * knew your own uuid.
 *
 * A redirect rather than a header prop: the alternative was shipping the
 * signed-in user's id into every rendered page so the nav could build the
 * link, which puts an identifier in the HTML of every cached public page for
 * the sake of one anchor.
 *
 * Each role has its own idea of "my profile", so this sends them to theirs.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) throw redirect("/login?next=/me", { headers });

  const profile = await getProfile(env, user.id);
  const to =
    profile?.role === "guide"
      ? "/g/profile"
      : profile?.role === "ops"
        ? "/ops"
        : `/trekkers/${user.id}`;
  throw redirect(to, { headers });
}
