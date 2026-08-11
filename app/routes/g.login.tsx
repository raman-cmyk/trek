import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.login";
import { Button } from "~/components/Button";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";

export function meta() {
  return [{ title: "Guide sign in" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user } = await getSessionUser(request, env);
  // Role-aware, not just "is anyone signed in". Bouncing every session to /g
  // meant an ops or trekker cookie hit the guide gate, got sent back here,
  // and looped — ERR_TOO_MANY_REDIRECTS, with no way out but clearing
  // cookies. Only a guide gets redirected; anyone else sees the form and is
  // told why, because signing in here fixes it.
  if (!user) return { signedInAs: null };
  const profile = await getProfile(env, user.id);
  if (profile?.role === "guide") throw redirect("/g");
  return {
    signedInAs: { name: profile?.full_name ?? user.email ?? "someone else", role: profile?.role ?? "trekker" },
  };
}

/**
 * Guides sign in with email + password, same as everyone else. (The old
 * phone-OTP flow needed a Supabase-supported SMS provider that doesn't exist
 * here — Sparrow is used for outbound notifications only — so every applicant
 * hit "we couldn't send a code" forever. Sparrow OTP is in BACKLOG.)
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) {
    return data({ error: "Enter your email and password." }, { status: 400 });
  }

  const { supabase, headers } = createSupabaseServerClient(request, env);
  const { data: res, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !res.user) {
    return data({ error: "That email and password didn’t match." }, { status: 400 });
  }
  const profile = await getProfile(env, res.user.id);
  if (profile?.role !== "guide") {
    await supabase.auth.signOut();
    return data({ error: "This account isn’t registered as a guide." }, { status: 403 });
  }
  return redirect("/g", { headers });
}

export default function GuideLogin({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const error = actionData && "error" in actionData ? (actionData as any).error : null;
  const signedInAs = (loaderData as any)?.signedInAs ?? null;

  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-3xl text-ink">Guide sign in</h1>
      <p className="mt-2 text-ink-soft">
        Use the email and password you set when you applied.
      </p>

      {/* Someone else's session is what used to cause the redirect loop.
          Say so plainly, and give the way out. */}
      {signedInAs && (
        <div className="mt-6 rounded-button border border-line bg-mist px-3 py-2.5 text-sm text-ink">
          You're signed in as <strong>{signedInAs.name}</strong> ({signedInAs.role}).
          Signing in below switches account, or{" "}
          <Form method="post" action="/logout" className="inline">
            <button className="underline underline-offset-2 hover:text-moss">sign out</button>
          </Form>
          .
        </div>
      )}

      <Form method="post" className="mt-8 space-y-4">
        <label className="block">
          <span className="text-sm text-ink-soft">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            className="mt-1 w-full rounded-button border border-border px-3 py-3 text-lg outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Password</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-button border border-border px-3 py-3 text-lg outline-none focus:border-primary"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Sign in
        </Button>
      </Form>

      <p className="mt-6 text-sm text-ink-soft">
        Not a guide on Trek yet?{" "}
        <a href="/apply" className="text-primary hover:underline">
          Apply here
        </a>
        . Forgotten your password? Message our team — we'll reset it for you.
      </p>
    </main>
  );
}
