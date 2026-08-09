import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/ops.login";
import { Button } from "~/components/Button";
import {
  createAdminClient,
  createSupabaseServerClient,
  getEnv,
} from "~/lib/supabase.server";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Ops sign in" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { supabase } = createSupabaseServerClient(request, env);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const admin = createAdminClient(env);
    const { data: profile } = await admin
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role === "ops") throw redirect("/ops/verifications");
  }
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  const { supabase, headers } = createSupabaseServerClient(request, env);
  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !signIn.user) {
    return data({ error: "Wrong email or password." }, { status: 400 });
  }
  // Confirm the ops role before letting them in.
  const admin = createAdminClient(env);
  const { data: profile } = await admin
    .from("users")
    .select("role")
    .eq("id", signIn.user.id)
    .single();
  if (profile?.role !== "ops") {
    await supabase.auth.signOut();
    return data({ error: "This account is not an ops account." }, { status: 403 });
  }
  return redirect("/ops/verifications", { headers });
}

export default function OpsLogin({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl text-ink">Trek Ops</h1>
      <p className="mt-1 text-ink-soft">Sign in to the operations console.</p>
      <Form method="post" className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm text-ink-soft">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            className="mt-1 w-full rounded-button border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-button border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        {actionData?.error && (
          <p className="text-sm text-danger">{actionData.error}</p>
        )}
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
      </Form>
    </main>
  );
}
