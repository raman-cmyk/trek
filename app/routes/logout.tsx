import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";

// Sign out (customer). POST from the header; GET just bounces home.
export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request, getEnv(context));
  await supabase.auth.signOut();
  return redirect("/", { headers });
}

// A GET here used to bounce home without signing anybody out, so typing
// /logout, following a plain link or hitting a bookmark left the person
// signed in while looking like it had worked.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, headers } = createSupabaseServerClient(request, getEnv(context));
  await supabase.auth.signOut();
  return redirect("/", { headers });
}
