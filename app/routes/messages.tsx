import { Link, Outlet, data, useLocation } from "react-router";
import type { Route } from "./+types/messages";
import { getEnv, createAdminClient } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { Header } from "~/components/public/Header";
import { SmartImage } from "~/components/SmartImage";
import { listThreads, type ThreadSummary } from "~/lib/threads.server";
import { countUnread } from "~/lib/unread.server";
import { cn } from "~/lib/cn";

export function meta() {
  return [{ title: "Messages" }, { name: "robots", content: "noindex" }];
}

/**
 * The messaging shell.
 *
 * Messaging is an application, not a document: it fills the viewport below the
 * nav, it does not scroll past the conversation, and it has no footer or
 * ridgeline wave. That is not only taste — under the marketing layout the
 * composer was `sticky bottom-0` with a footer rendered after it, so on most
 * screens the input was simply covered. The page looked like it had no way to
 * type.
 *
 * Desktop is two panes (rail + thread); mobile is one pane, and the rail is
 * the index route with the thread pushing over it.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, profile, admin, headers } = await requireUser(request, env);

  // Presence: stamped on real page loads, rate-limited in SQL to one write
  // every couple of minutes so a chatty tab doesn't hammer the row.
  await admin.rpc("touch_last_seen", { uid: user.id }).then(
    () => {},
    () => {},
  );

  const [threads, { unreadTotal }] = await Promise.all([
    listThreads(admin, user.id),
    countUnread(createAdminClient(env), user.id),
  ]);

  return data(
    {
      threads,
      account: {
        firstName: (profile.full_name ?? "").split(" ")[0] || "You",
        role: profile.role,
        unread: unreadTotal,
      },
    },
    { headers },
  );
}

export default function MessagesShell({ loaderData }: Route.ComponentProps) {
  const { threads, account } = loaderData as {
    threads: ThreadSummary[];
    account: { firstName: string; role: string; unread: number };
  };
  const { pathname } = useLocation();
  const onIndex = pathname === "/messages" || pathname === "/messages/";

  return (
    // h-dvh, not h-screen: on a phone h-screen is the wrong height once the
    // browser chrome collapses, and the composer ends up under the URL bar.
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header account={account} />

      <div className="flex min-h-0 flex-1">
        {/* Conversation rail — always on desktop; on mobile it IS the index
            route, so hide it there to avoid rendering the list twice. */}
        <aside
          className={cn(
            "w-full shrink-0 overflow-y-auto border-r border-line bg-card lg:block lg:w-80",
            onIndex ? "block" : "hidden",
          )}
        >
          <ThreadRail threads={threads} />
        </aside>

        <main className={cn("min-h-0 min-w-0 flex-1", onIndex && "hidden lg:block")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ThreadRail({ threads }: { threads: ThreadSummary[] }) {
  const { pathname } = useLocation();
  return (
    <>
      <h1 className="border-b border-line px-4 py-3 font-display text-lg text-ink">
        Messages
      </h1>
      {threads.length === 0 ? (
        <div className="p-4">
          <p className="text-sm text-muted">
            No conversations yet. Messaging a guide is free and they answer
            themselves.
          </p>
          <Link
            to="/guides"
            className="mt-3 inline-block rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
          >
            Find your guide →
          </Link>
        </div>
      ) : (
        <ul>
          {threads.map((t) => {
            const active = pathname === t.to;
            return (
              <li key={t.key}>
                <Link
                  to={t.to}
                  prefetch="intent"
                  className={cn(
                    "flex gap-3 border-b border-line px-4 py-3 transition-colors",
                    active ? "bg-mist" : "hover:bg-mist/60",
                  )}
                >
                  <SmartImage
                    src={t.avatar ?? ""}
                    alt=""
                    width={44}
                    height={44}
                    className="h-10 w-10 shrink-0 rounded-full"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-medium text-ink">{t.withName}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">
                        {timeAgo(t.at)}
                      </span>
                    </span>
                    {t.about && (
                      <span className="block truncate text-caption text-muted">{t.about}</span>
                    )}
                    <span className="mt-0.5 flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          t.unread > 0 ? "font-medium text-ink" : "text-muted",
                        )}
                      >
                        {t.snippet}
                      </span>
                      {t.unread > 0 && (
                        <span
                          aria-label={`${t.unread} unread`}
                          className="h-2 w-2 shrink-0 rounded-full bg-moss"
                        />
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}
