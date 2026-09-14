import { Link, data } from "react-router";
import type { Route } from "./+types/blocked";
import { copy } from "~/lib/copy";
import { blockedMessage } from "~/lib/blocking";
import { activeBlockFor } from "~/lib/blocking.server";
import { getSessionUser } from "~/lib/auth.server";
import { fmtDate } from "~/lib/format";
import { createAdminClient, getEnv } from "~/lib/supabase.server";

export function meta() {
  return [{ title: copy.blocked.title }, { name: "robots", content: "noindex" }];
}

/**
 * Where a blocked person lands. The one thing it must do is end their
 * session — requireUser sent them here precisely because the session was
 * still open — and the one thing it must say is when, if ever, they can
 * come back.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, supabase, headers } = await getSessionUser(request, env);
  let block = null;
  if (user) {
    block = await activeBlockFor(createAdminClient(env), user.id);
    await supabase.auth.signOut();
  }
  return data(
    {
      banned: block?.kind === "banned",
      message: blockedMessage(block, fmtDate),
    },
    { headers },
  );
}

export default function Blocked({ loaderData }: Route.ComponentProps) {
  const { banned, message } = loaderData;
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <h1 className="font-display text-3xl text-ink">
        {banned ? copy.blocked.titleBanned : copy.blocked.title}
      </h1>
      <p className="mt-3 text-lg text-ink">{message}</p>
      <p className="mt-2 text-ink-soft">{copy.blocked.body}</p>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <a href="mailto:hello@guidesofnepal.com" className="font-medium text-primary hover:underline">
          {copy.blocked.writeToUs}
        </a>
        <Link to="/" className="text-ink-soft hover:underline">
          {copy.blocked.backHome}
        </Link>
      </div>
    </main>
  );
}
