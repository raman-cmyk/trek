import { Form, Link, data, useNavigation } from "react-router";
import type { Route } from "./+types/forgot";
import { Button } from "~/components/Button";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { sendEmail } from "~/lib/notify.server";
import { resetSentMessage } from "~/lib/password";
import { BRAND } from "~/lib/brand";

export function meta() {
  return [{ title: "Forgot your password" }, { name: "robots", content: "noindex" }];
}

/**
 * The way back in.
 *
 * There was none. Everybody on this platform signs in with an email and a
 * password — trekkers, guides and the office alike — and a guide who forgot
 * theirs had exactly one route back: ring Kathmandu and ask somebody to reset
 * it by hand.
 *
 * The link is minted here with the service role and sent through our own mail
 * (Resend), rather than through Supabase's built-in sender: it is the same
 * machinery "Open as them" already uses on /ops/users, it arrives from the
 * address people recognise, and it is logged in email_log like everything
 * else we send.
 */
export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();

  if (!/.+@.+\..+/.test(email)) {
    return data({ error: "That email doesn't look right." }, { status: 400 });
  }

  const admin = createAdminClient(env);
  const { data: link } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const token = link?.properties?.hashed_token;

  // No account, or the link could not be made: say exactly what we say when it
  // worked. Anything else turns this box into a tool for asking whether a
  // given person has an account here.
  if (token) {
    const url = new URL("/reset", env.SITE_URL || request.url);
    url.searchParams.set("token_hash", token);
    await sendEmail(
      env,
      email,
      "Set a new password",
      [
        `Somebody asked to reset the password on your ${BRAND} account.`,
        `Set a new password: ${url.toString()}`,
        "The link works once and lasts an hour.",
        "If this wasn't you, you can ignore this — nothing has changed.",
      ].join("\n\n"),
      { kind: "password_reset" },
    );
  }

  return data({ sent: resetSentMessage(email) });
}

export default function Forgot({ actionData }: Route.ComponentProps) {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const sent = actionData && "sent" in actionData ? (actionData as any).sent : null;

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-3xl text-ink">Forgot your password</h1>

      {sent ? (
        <>
          <p className="mt-3 rounded-card bg-moss/10 p-3 text-sm text-moss">{sent}</p>
          <p className="mt-3 text-sm text-ink-soft">
            Nothing arrived? Look in your spam folder, then{" "}
            <Link to="/forgot" className="font-medium text-primary hover:underline">
              try again
            </Link>
            .
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-ink-soft">
            Tell us the email you sign in with and we will send you a link to
            set a new one.
          </p>
          <Form method="post" className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm text-ink-soft">Email</span>
              <input
                name="email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                className="mt-1 w-full rounded-button border border-border px-3 py-2 outline-none focus:border-primary"
              />
            </label>
            {actionData && "error" in actionData && (actionData as any).error && (
              <p className="text-sm text-danger">{(actionData as any).error}</p>
            )}
            <Button type="submit" loading={busy} className="w-full">
              Send me a link
            </Button>
          </Form>
        </>
      )}

      <p className="mt-6 text-sm text-ink-soft">
        <Link to="/login" className="font-medium text-primary hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </main>
  );
}
