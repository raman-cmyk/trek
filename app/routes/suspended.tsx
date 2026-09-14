import { Form, Link, data } from "react-router";
import type { Route } from "./+types/suspended";
import { BRAND } from "~/lib/brand";

/**
 * Where somebody lands when their account is closed or suspended.
 *
 * Signed out of everything else, told exactly what was decided and why, and
 * given a way to argue with it. The version of this page that says "access
 * denied" and nothing else is how a misunderstanding — a guide who pasted a
 * phone number to be helpful — becomes somebody who never comes back.
 *
 * The reason arrives in the URL because the request that redirected here is
 * the one that read it; re-reading it would mean letting a blocked session
 * make another query.
 */
export function meta() {
  return [{ title: `Account on hold · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const why = new URL(request.url).searchParams.get("why") ?? "";
  return data({ why: why.slice(0, 400) });
}

export default function Suspended({ loaderData }: Route.ComponentProps) {
  const { why } = loaderData;
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <h1 className="font-display text-2xl text-ink">Your account is on hold</h1>
      <p className="mt-3 whitespace-pre-wrap text-ink">
        {why || "Your account cannot be used right now."}
      </p>
      {/* No address invented here: the email we sent when this was decided
          says to reply to it, and that reply reaches a person. Sending them
          hunting for a support address we have not set up would be worse than
          the hold itself. */}
      <p className="mt-4 text-sm text-ink-soft">
        If you think this is a mistake, reply to the email we sent you about
        it — a person reads those, not a machine. Say what happened from your
        side.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {/* Signing out is the one thing they can still usefully do: the
            session is what keeps bouncing them here. */}
        <Form method="post" action="/logout">
          <button className="text-sm text-muted underline underline-offset-4 hover:text-ink">
            Sign out
          </button>
        </Form>
        <Link to="/" className="text-sm text-muted underline underline-offset-4 hover:text-ink">
          Back to the site
        </Link>
      </div>
    </main>
  );
}
