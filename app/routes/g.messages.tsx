import { Link, data } from "react-router";
import type { Route } from "./+types/g.messages";
import { getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { listThreads, type ThreadSummary } from "~/lib/threads.server";
import { firstName } from "~/lib/names";
import { cn } from "~/lib/cn";

/**
 * The guide's inbox, inside the guide's app.
 *
 * The Messages tab used to jump to /messages — the trekker-styled shell with
 * the public header, a different layout, and no way back to the tab bar. For
 * a guide that read as being thrown out of his own app mid-task. The threads
 * are the same; the room they open in is now his.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, admin, headers } = await requireUser(request, env, "guide");
  const threads = await listThreads(admin, user.id);
  return data({ threads }, { headers });
}

export default function GuideMessages({ loaderData }: Route.ComponentProps) {
  const { threads } = loaderData as { threads: ThreadSummary[] };
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl text-ink">Messages</h1>
      {threads.length === 0 ? (
        <p className="text-sm text-ink-soft">
          When somebody writes to you it lands here. We text you too.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-border bg-card">
          {threads.map((t) => (
            <li key={t.key}>
              <Link to={t.to} className="flex items-center gap-3 p-3 hover:bg-mist/60">
                {t.avatar ? (
                  <img src={t.avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mist font-medium text-moss">
                    {firstName(t.withName).slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", t.unread ? "font-semibold text-ink" : "font-medium text-ink")}>
                    {firstName(t.withName)}
                    {t.about && <span className="font-normal text-ink-soft"> · {t.about}</span>}
                  </span>
                  <span className="block truncate text-xs text-ink-soft">{t.snippet}</span>
                </span>
                {t.unread > 0 && (
                  <span className="shrink-0 rounded-full bg-ember px-1.5 text-xs font-medium text-white">
                    {t.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
