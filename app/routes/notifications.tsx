import { Form, Link, data, redirect } from "react-router";
import type { Route } from "./+types/notifications";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { BRAND } from "~/lib/brand";
import { whenLabel, type NotificationRow } from "~/lib/inapp";
import { cn } from "~/lib/cn";

/**
 * Everything the platform has told you.
 *
 * "When a guide books a date and the trip shows deposit due, nothing shows up
 * — I don't get a notification in app or through email." The email half was
 * real and had never once been sent; this is the half that did not exist.
 *
 * Rows are written at the moment an email is composed, before the part that
 * needs an API key, so this page works whether or not mail is going out.
 */
export function meta() {
  return [{ title: `Notifications · ${BRAND}` }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env);
  const { data: rows } = await admin
    .from("notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return data(
    {
      rows: (rows ?? []) as NotificationRow[],
      now: new Date().toISOString(),
      // Only claimed when it is true. Email has been unconfigured since the
      // first day, and "we also emailed you" sends somebody hunting through a
      // spam folder for something that was never sent.
      alsoEmailed: !!env.RESEND_API_KEY,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const now = new Date().toISOString();

  // Opening one marks it read and takes you where it points. Both halves
  // matter: a notification that stays bold after you have acted on it teaches
  // people that the number on the bell means nothing.
  if (intent === "open") {
    const id = String(form.get("id") ?? "");
    await admin
      .from("notifications")
      .update({ read_at: now })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("read_at", null);
    const href = String(form.get("href") ?? "");
    const safe = href.startsWith("/") && !href.startsWith("//") ? href : "/notifications";
    throw redirect(safe, { headers });
  }

  if (intent === "read_all") {
    await admin
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
  }
  return data({ ok: true }, { headers });
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const { rows, now, alsoEmailed } = loaderData;
  const unread = rows.filter((r) => !r.read_at).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl text-ink">Notifications</h1>
        {unread > 0 && (
          <Form method="post">
            <input type="hidden" name="intent" value="read_all" />
            <button className="text-sm text-moss underline underline-offset-4 hover:text-pine">
              Mark all read
            </button>
          </Form>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-card border border-line bg-card p-6 text-center text-sm text-ink-soft">
          Nothing yet. When a guide replies to you, or a deposit is due, or your
          permits are filed, it turns up here.
        </p>
      ) : (
        <ul className="mt-5 divide-y divide-line rounded-card border border-line bg-card">
          {rows.map((n) => (
            <li key={n.id}>
              {/* A form rather than a link: opening it marks it read on the
                  server, so it still works with JavaScript off and cannot
                  drift from what the bell counts. */}
              <Form method="post" className="block">
                <input type="hidden" name="intent" value="open" />
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="href" value={n.href ?? ""} />
                <button
                  type="submit"
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-mist/60",
                    !n.href && "cursor-default",
                  )}
                >
                  {/* Unread is a dot, not a colour wash: the list is scanned
                      down the left edge. */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.read_at ? "bg-transparent" : "bg-ember",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={cn("text-sm text-ink", !n.read_at && "font-medium")}>
                        {n.title}
                      </span>
                      <span className="shrink-0 text-caption text-muted">
                        {whenLabel(n.created_at, now)}
                      </span>
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block text-sm text-ink-soft">{n.body}</span>
                    )}
                    {!n.read_at && <span className="sr-only"> — new</span>}
                  </span>
                </button>
              </Form>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-caption text-muted">
        {alsoEmailed ? "These are also emailed to you. " : ""}
        <Link to="/trips" className="underline underline-offset-4 hover:text-ink">
          My trips
        </Link>{" "}
        has the full picture of anything you have booked.
      </p>
    </main>
  );
}
