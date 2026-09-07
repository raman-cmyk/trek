import { Form, data } from "react-router";
import type { Route } from "./+types/email.unsubscribe.$token";
import { createAdminClient, getEnv } from "~/lib/supabase.server";

/**
 * Stop the emails. One click, signed out, from a link that may be years old.
 *
 * The token is a random per-user secret, not anything derived from an id, so
 * a leaked link reveals nothing about the account and guessing one is
 * hopeless. Gmail's own unsubscribe button POSTs here directly
 * (List-Unsubscribe-Post), so the POST must work with no session, no CSRF
 * token and no page ever being loaded.
 *
 * Unsubscribing never touches transactional mail. Somebody who opts out of
 * our writing still gets told their deposit was taken.
 */

export function meta() {
  return [{ title: "Email preferences · Guides of Nepal" }, { name: "robots", content: "noindex" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const admin = createAdminClient(getEnv(context));
  const { data: u } = await admin
    .from("users")
    .select("full_name, email, marketing_consent")
    .eq("unsubscribe_token", params.token!)
    .maybeSingle();
  // A wrong or rotated token is not an error worth explaining — say the same
  // thing either way rather than confirming whether an address exists.
  return data({ found: !!u, email: u?.email ?? null, off: u ? !u.marketing_consent : true });
}

export async function action({ params, context }: Route.ActionArgs) {
  const admin = createAdminClient(getEnv(context));
  await admin
    .from("users")
    .update({
      marketing_consent: false,
      email_prefs: [],
      consent_source: "unsubscribe_link",
      consent_at: new Date().toISOString(),
    })
    .eq("unsubscribe_token", params.token!);
  return data({ done: true });
}

export default function Unsubscribe({ loaderData, actionData }: Route.ComponentProps) {
  const done = (actionData as any)?.done || loaderData.off;
  return (
    <main className="mx-auto max-w-md px-4 py-20 text-center">
      {done ? (
        <>
          <h1 className="font-display text-2xl text-ink">You're off the list</h1>
          <p className="mt-3 text-ink-soft">
            {loaderData.email
              ? `We won't email ${loaderData.email} about trips or offers again.`
              : "We won't email you about trips or offers again."}
          </p>
          <p className="mt-3 text-sm text-ink-soft">
            You'll still get messages about a trip you've actually booked —
            your deposit, your dates, your guide. Those aren't marketing and we
            can't stop those without stopping your booking.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl text-ink">Stop these emails?</h1>
          <p className="mt-3 text-ink-soft">
            {loaderData.email
              ? `We'll stop sending ${loaderData.email} anything about trips or offers.`
              : "We'll stop sending you anything about trips or offers."}
          </p>
          <Form method="post" className="mt-6">
            <button className="rounded-button bg-pine px-5 py-2.5 text-sm font-medium text-white hover:bg-moss">
              Yes, stop them
            </button>
          </Form>
          <p className="mt-4 text-sm text-ink-soft">
            Anything about a trip you've booked will still reach you.
          </p>
        </>
      )}
    </main>
  );
}
