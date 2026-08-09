import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/Button";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { ensureTrekkerProfile, getSessionUser } from "~/lib/auth.server";

export function meta() {
  return [{ title: "Sign in" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await getSessionUser(request, getEnv(context));
  if (user) throw redirect("/");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const email = String(form.get("email") ?? "").trim();
  const { supabase, headers } = createSupabaseServerClient(request, env);

  if (intent === "send") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) return data({ error: error.message }, { status: 400 });
    return data({ sent: true, email }, { headers });
  }

  // verify
  const token = String(form.get("token") ?? "").trim();
  const { data: res, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error || !res.user) {
    return data({ error: "That code didn’t work. Try again.", sent: true, email }, { status: 400 });
  }
  await ensureTrekkerProfile(env, res.user);
  // My Trips lands in M7; send trekkers home for now.
  return redirect("/", { headers });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const sent = actionData && "sent" in actionData && actionData.sent;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl text-ink">Sign in</h1>
      <p className="mt-1 text-ink-soft">
        We’ll email you a 6-digit code — no password to remember.
      </p>

      {!sent ? (
        <Form method="post" className="mt-6 space-y-4">
          <input type="hidden" name="intent" value="send" />
          <label className="block">
            <span className="text-sm text-ink-soft">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-button border border-border px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          {actionData && "error" in actionData && (actionData as any).error && (
            <p className="text-sm text-danger">{(actionData as any).error}</p>
          )}
          <Button type="submit" loading={busy} className="w-full">
            Email me a code
          </Button>
        </Form>
      ) : (
        <Form method="post" className="mt-6 space-y-4">
          <input type="hidden" name="intent" value="verify" />
          <input type="hidden" name="email" value={String((actionData as any).email ?? "")} />
          <p className="text-sm text-ink">
            Code sent to <strong>{String((actionData as any).email ?? "")}</strong>.
          </p>
          <label className="block">
            <span className="text-sm text-ink-soft">6-digit code</span>
            <input
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="mt-1 w-full rounded-button border border-border px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-primary"
            />
          </label>
          {actionData && "error" in actionData && (actionData as any).error && (
            <p className="text-sm text-danger">{(actionData as any).error}</p>
          )}
          <Button type="submit" loading={busy} className="w-full">
            Verify &amp; sign in
          </Button>
        </Form>
      )}
    </main>
  );
}
