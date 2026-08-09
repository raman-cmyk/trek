import { Form, Outlet, data } from "react-router";
import type { Route } from "./+types/g";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";

// Guide area — mobile-first (docs/04 §Guide dashboard). M4 ships the status
// page; the full dashboard (enquiries, calendar, earnings) lands in M5.
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { profile, headers } = await requireUser(request, env, "guide");
  return data({ name: profile.full_name }, { headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { createSupabaseServerClient } = await import("~/lib/supabase.server");
  const { supabase, headers } = createSupabaseServerClient(request, env);
  await supabase.auth.signOut();
  const { redirect } = await import("react-router");
  return redirect("/g/login", { headers });
}

export default function GuideLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto min-h-screen max-w-md bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <span className="font-display text-lg">Trek Guide</span>
        <Form method="post">
          <button className="text-xs text-primary">Sign out</button>
        </Form>
      </header>
      <div className="p-4">
        <Outlet />
      </div>
    </div>
  );
}
