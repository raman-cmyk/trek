import { Form, Link, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/reset";
import { Button } from "~/components/Button";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";
import { homePathFor } from "~/lib/super-admin";
import { passwordProblem } from "~/lib/password";

export function meta() {
  return [{ title: "Set a new password" }, { name: "robots", content: "noindex" }];
}

/**
 * The far end of the link in the reset email.
 *
 * The token in the URL is the credential — single use, an hour's life — and
 * verifying it signs this browser in as that person, exactly as the magic
 * link on /ops/users does. That session is what then lets them set a new
 * password: the change is made as themselves, not by an admin on their
 * behalf, so it works the same for a guide, a trekker and the office.
 *
 * The token is traded for a session in the loader, which is why the form
 * itself carries nothing secret: by the time it renders, the link has already
 * done its one job and cannot be reused by anybody who finds it later in a
 * browser history.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const token = new URL(request.url).searchParams.get("token_hash") ?? "";

  if (token) {
    const { supabase, headers } = createSupabaseServerClient(request, env);
    const { data: res, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: "recovery",
    });
    if (!error && res.user) {
      // Drop the token out of the address bar: it has been spent, and a URL
      // that looks like a credential gets pasted into chats and bug reports.
      throw redirect("/reset", { headers });
    }
    return data(
      {
        ready: false,
        expired: true,
      },
      { status: 400 },
    );
  }

  // No token in the URL: either they have just been redirected here having
  // used one, or they wandered in.
  const { user } = await getSessionUser(request, env);
  return { ready: Boolean(user), expired: false };
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, headers } = await getSessionUser(request, env);
  if (!user) {
    return data(
      { error: "That link has expired. Ask for a new one." },
      { status: 401, headers },
    );
  }

  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const problem = passwordProblem(password, String(form.get("confirm") ?? ""));
  if (problem) return data({ error: problem }, { status: 400, headers });

  const { supabase, headers: authHeaders } = createSupabaseServerClient(request, env);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return data({ error: error.message }, { status: 400, headers });

  // Straight to wherever this person actually lives, already signed in — the
  // one moment where sending somebody to a login screen would be absurd.
  const profile = await getProfile(env, user.id);
  throw redirect(homePathFor(profile?.role), { headers: authHeaders });
}

export default function Reset({ loaderData, actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const { ready, expired } = loaderData as { ready: boolean; expired: boolean };

  if (!ready) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
        <h1 className="font-display text-3xl text-ink">
          {expired ? "That link has expired" : "Nothing to do here"}
        </h1>
        <p className="mt-2 text-ink-soft">
          {expired
            ? "Reset links work once and last an hour. Ask for a fresh one and it will be in your inbox in a minute."
            : "Reset links arrive by email. Ask for one and we will send it."}
        </p>
        <Link
          to="/forgot"
          className="mt-4 font-medium text-primary hover:underline"
        >
          Send me a link →
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl text-ink">Set a new password</h1>
      <p className="mt-1 text-ink-soft">
        Pick something you will remember. You are signed in already — this is
        the last step.
      </p>

      <Form method="post" className="mt-6 space-y-4">
        <label className="block">
          <span className="text-sm text-ink-soft">New password</span>
          <input
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            className="mt-1 w-full rounded-button border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="text-sm text-ink-soft">Type it once more</span>
          <input
            name="confirm"
            type="password"
            required
            autoComplete="new-password"
            className="mt-1 w-full rounded-button border border-border px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        {actionData && "error" in actionData && (actionData as any).error && (
          <p className="text-sm text-danger">{(actionData as any).error}</p>
        )}
        <Button type="submit" loading={busy} className="w-full">
          Save it and continue
        </Button>
      </Form>
    </main>
  );
}
