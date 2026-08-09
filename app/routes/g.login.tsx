import { Form, data, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/g.login";
import { Button } from "~/components/Button";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";

export function meta() {
  return [{ title: "Guide sign in" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { user } = await getSessionUser(request, getEnv(context));
  if (user) throw redirect("/g");
  return null;
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const phone = String(form.get("phone") ?? "").trim();
  const { supabase, headers } = createSupabaseServerClient(request, env);

  if (intent === "send") {
    // Guides must have applied first — don't create a new user here.
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: false },
    });
    if (error) {
      return data(
        { error: "We couldn’t send a code. Make sure you’ve applied and SMS is set up." },
        { status: 400 },
      );
    }
    return data({ sent: true, phone }, { headers });
  }

  const token = String(form.get("token") ?? "").trim();
  const { data: res, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: "sms",
  });
  if (error || !res.user) {
    return data({ error: "That code didn’t work.", sent: true, phone }, { status: 400 });
  }
  const profile = await getProfile(env, res.user.id);
  if (profile?.role !== "guide") {
    await supabase.auth.signOut();
    return data({ error: "This number isn’t registered as a guide." }, { status: 403 });
  }
  return redirect("/g", { headers });
}

export default function GuideLogin({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const sent = actionData && "sent" in actionData && actionData.sent;

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl text-ink">Guide sign in</h1>
      <p className="mt-1 text-ink-soft">We text a code to your phone.</p>

      {!sent ? (
        <Form method="post" className="mt-6 space-y-4">
          <input type="hidden" name="intent" value="send" />
          <label className="block">
            <span className="text-sm text-ink-soft">Phone</span>
            <input
              name="phone"
              type="tel"
              required
              placeholder="+9779…"
              className="mt-1 w-full rounded-button border border-border px-3 py-3 text-lg outline-none focus:border-primary"
            />
          </label>
          {actionData && "error" in actionData && (actionData as any).error && (
            <p className="text-sm text-danger">{(actionData as any).error}</p>
          )}
          <Button type="submit" loading={busy} size="lg" className="w-full">
            Text me a code
          </Button>
          <p className="text-center text-sm text-ink-soft">
            New guide?{" "}
            <a href="/apply" className="text-primary hover:underline">
              Apply here
            </a>
          </p>
        </Form>
      ) : (
        <Form method="post" className="mt-6 space-y-4">
          <input type="hidden" name="intent" value="verify" />
          <input type="hidden" name="phone" value={String((actionData as any).phone ?? "")} />
          <label className="block">
            <span className="text-sm text-ink-soft">6-digit code</span>
            <input
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="mt-1 w-full rounded-button border border-border px-3 py-3 text-center text-xl tracking-widest outline-none focus:border-primary"
            />
          </label>
          {actionData && "error" in actionData && (actionData as any).error && (
            <p className="text-sm text-danger">{(actionData as any).error}</p>
          )}
          <Button type="submit" loading={busy} size="lg" className="w-full">
            Sign in
          </Button>
        </Form>
      )}
    </main>
  );
}
