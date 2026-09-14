import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/notifications";
import { requireUser } from "~/lib/auth.server";
import { getEnv } from "~/lib/supabase.server";
import { markSeen, recentNotifications } from "~/lib/notifications-read.server";
import { ago, hrefFor } from "~/lib/inapp";
import { pageMeta } from "~/lib/seo";

/**
 * Everything the platform has told you.
 *
 * It had told nobody anything. Every notification went to email or SMS, and
 * production has a key for neither — thirty-nine attempts, all of them logged
 * "skipped, no api key". This is the channel that does not depend on a third
 * party, a verified domain or a Nepali carrier.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env);
  const rows = await recentNotifications(admin, user.id, 50);
  return Response.json(
    { rows, now: new Date().toISOString() },
    { headers: { ...Object.fromEntries(headers), "Cache-Control": "private, no-store" } },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin } = await requireUser(request, env);
  const form = await request.formData();
  // Only what was on screen. Anything that arrived while they were reading is
  // still unread afterwards, which is the honest answer.
  const ids = form
    .getAll("id")
    .map(String)
    .filter((s: string) => /^[0-9a-f-]{36}$/i.test(s));
  await markSeen(admin, user.id, ids);
  return redirect("/notifications");
}

export function meta() {
  return pageMeta({
    title: "Your notifications",
    description: "Everything that has happened on your trips.",
    canonical: "",
    noindex: true,
  });
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { rows, now } = loaderData as {
    rows: Array<{
      id: string;
      kind: string;
      title: string;
      body: string | null;
      href: string | null;
      read_at: string | null;
      created_at: string;
    }>;
    now: string;
  };
  const unread = rows.filter((r) => !r.read_at);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl text-ink">Notifications</h1>
        {unread.length > 0 && (
          <Form method="post">
            {unread.map((r) => (
              <input key={r.id} type="hidden" name="id" value={r.id} />
            ))}
            <button className="rounded-button border border-line px-3 py-1.5 text-sm text-ink hover:bg-mist">
              Mark all {unread.length} as read
            </button>
          </Form>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-card border border-line bg-card p-5 text-ink-soft">
          Nothing yet. When a guide answers you, a payment goes through, or a
          trip changes, it appears here.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-card border border-line bg-card">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                to={hrefFor(r.kind, r.href)}
                className={`flex items-start gap-3 p-4 hover:bg-mist/50 ${
                  r.read_at ? "" : "bg-mist/30"
                }`}
              >
                {/* One dot, unread only. A row that shouts at you after you
                    have read it is how a list stops being read. */}
                <span
                  aria-hidden
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    r.read_at ? "bg-transparent" : "bg-moss"
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{r.title}</span>
                  {r.body && (
                    <span className="mt-0.5 block text-sm text-ink-soft">{r.body}</span>
                  )}
                  <span className="mt-1 block text-caption text-muted">
                    {ago(r.created_at, new Date(now))}
                    {r.read_at ? "" : " · new"}
                  </span>
                </span>
                <span aria-hidden className="mt-1 shrink-0 text-muted">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
