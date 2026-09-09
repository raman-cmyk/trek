import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/Button";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { ensureTrekkerProfile, getProfile, getSessionUser } from "~/lib/auth.server";

export function meta() {
  return [{ title: "Sign in" }, { name: "robots", content: "noindex" }];
}

function safeNext(raw: string | null): string {
  // Only allow same-site absolute paths.
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  // Filled in when ops sends someone here with their address already known.
  const email = (url.searchParams.get("email") ?? "").slice(0, 200);
  const { user } = await getSessionUser(request, env);
  if (!user) return { next, email };
  // Send people where their role can actually go. Redirecting everyone to
  // `next` dumped a signed-in guide onto a trekker-gated page, which bounced
  // them somewhere else again — same failure as the /g/login loop, one step
  // shorter.
  const profile = await getProfile(env, user.id);
  if (profile?.role === "guide") throw redirect("/g");
  if (profile?.role === "ops") throw redirect("/ops");
  throw redirect(next);
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const { supabase, headers } = createSupabaseServerClient(request, env);

  const { data: res, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !res.user) {
    return data({ error: "Wrong email or password." }, { status: 400 });
  }
  await ensureTrekkerProfile(env, res.user);
  return redirect(safeNext(String(form.get("next") ?? "/")), { headers });
}

export default function Login({ actionData, loaderData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const next = loaderData?.next ?? "/";

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl text-ink">Welcome back</h1>
      <p className="mt-1 text-ink-soft">Sign in to your Guides of Nepal account.</p>
      <p className="mt-2 text-sm text-ink-soft">
        New to Guides of Nepal?{" "}
        <a
          href={`/signup${next && next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Create your account →
        </a>
      </p>

      <Form method="post" className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="text-sm text-ink-soft">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue={loaderData?.email ?? ""}
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
        {actionData && "error" in actionData && (actionData as any).error && (
          <p className="text-sm text-danger">{(actionData as any).error}</p>
        )}
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
      </Form>
    </main>
  );
}
