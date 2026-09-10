import { redirect } from "react-router";
import type { Route } from "./+types/ops.logout";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";

/**
 * Signing the office out, from anywhere in the console.
 *
 * Same bug as the guide dashboard had: a `<Form method="post">` with no action
 * posts to the page you are standing on. From Today or Verifications — no
 * action — that is a 405; from People or Payouts it ran that page's action,
 * which answered "Unknown action" and left the session alive.
 *
 * Outside the ops layout, because that layout's loader requires an ops session
 * and this is the request that ends one.
 */
async function signOutToLogin(request: Request, context: any) {
  const { supabase, headers } = createSupabaseServerClient(request, getEnv(context));
  await supabase.auth.signOut();
  return redirect("/ops/login", { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  return signOutToLogin(request, context);
}

export async function loader({ request, context }: Route.LoaderArgs) {
  return signOutToLogin(request, context);
}
