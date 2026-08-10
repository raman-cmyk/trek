import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";

// Sign out (customer). POST from the header; GET just bounces home.
export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, headers } = createSupabaseServerClient(request, getEnv(context));
  await supabase.auth.signOut();
  return redirect("/", { headers });
}

export function loader() {
  return redirect("/");
}
