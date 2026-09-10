import { redirect } from "react-router";
import type { Route } from "./+types/g.logout";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";

/**
 * Signing a guide out, from anywhere in the dashboard.
 *
 * The button used to be a `<Form method="post">` with no action, which posts
 * to whatever page you happen to be on. On Earnings and Messages — which have
 * no action — that is a 405 and an error page; on Requests or the Calendar it
 * ran THAT page's action with no intent and left the guide signed in. Neither
 * failure looked like the same bug, and only one of them was visible.
 *
 * So the sign-out has an address of its own, outside the guide layout: that
 * layout's loader demands a signed-in guide, and by the time this has run
 * there is not one.
 */
async function signOutToLogin(request: Request, context: any) {
  const { supabase, headers } = createSupabaseServerClient(request, getEnv(context));
  await supabase.auth.signOut();
  return redirect("/g/login", { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  return signOutToLogin(request, context);
}

// A GET signs out too — a bookmark or a typed URL should not leave somebody
// signed in while looking like it worked.
export async function loader({ request, context }: Route.LoaderArgs) {
  return signOutToLogin(request, context);
}
