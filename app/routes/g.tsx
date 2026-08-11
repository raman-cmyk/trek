import { Form, NavLink, Outlet, data, redirect } from "react-router";
import type { Route } from "./+types/g";
import { cn } from "~/lib/cn";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";
import { countUnread } from "~/lib/unread.server";

export function meta() {
  return [{ title: "Guide dashboard" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { user, profile, admin, headers } = await requireUser(request, env, "guide");
  const [{ data: guide }, { count: enquiryCount }] = await Promise.all([
    admin.from("guides").select("status, slug").eq("user_id", user.id).single(),
    admin
      .from("enquiries")
      .select("id", { count: "exact", head: true })
      .eq("guide_id", user.id)
      .eq("status", "open"),
  ]);
  const { unreadTotal } = await countUnread(admin, user.id);
  return data(
    {
      name: profile.full_name,
      status: guide?.status ?? "applied",
      enquiryCount: enquiryCount ?? 0,
      unreadTotal,
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const env = getEnv(context);
  const { supabase, headers } = createSupabaseServerClient(request, env);
  await supabase.auth.signOut();
  return redirect("/g/login", { headers });
}

/**
 * Five tabs is the 360px ceiling — Earnings lives as a quick link on Home.
 *
 * Each carries an icon as well as a word. A row of five words in the same
 * weight and size is not a tab bar; it is a sentence you have to read every
 * time, and at a glance nothing tells you where you are. The icon is what
 * makes a tab findable by shape, which is how a bar like this is actually
 * used — thumb first, eyes second.
 */
const TABS = [
  { to: "/g", label: "Home", end: true, badge: 0, icon: IconHome },
  { to: "/g/enquiries", label: "Requests", badge: "enquiryCount" as const, icon: IconInbox },
  { to: "/messages", label: "Messages", badge: "unreadTotal" as const, icon: IconChat },
  { to: "/g/bookings", label: "Trips", badge: 0, icon: IconBoot },
  { to: "/g/calendar", label: "Calendar", badge: 0, icon: IconCalendar },
];

export default function GuideLayout({ loaderData }: Route.ComponentProps) {
  const { status, enquiryCount, unreadTotal } = loaderData;
  const verified = status === "verified";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <span className="font-display text-lg">Trek Guide</span>
        <Form method="post">
          <button className="text-xs text-primary">Sign out</button>
        </Form>
      </header>

      <div className={cn("flex-1 p-4", verified && "pb-24")}>
        <Outlet />
      </div>

      {verified && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-line bg-paper/95 backdrop-blur-md"
          // The home-indicator strip on an iPhone sits over the bottom of the
          // screen; without this the last row of a tab bar is under it.
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {TABS.map((t) => {
            const badge =
              t.badge === "enquiryCount"
                ? enquiryCount
                : t.badge === "unreadTotal"
                  ? unreadTotal
                  : 0;
            const Icon = t.icon;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                prefetch="intent"
                className={({ isActive }) =>
                  cn(
                    "group relative flex flex-1 flex-col items-center gap-1 pb-2 pt-2.5 text-[11px] transition-colors",
                    isActive ? "text-moss" : "text-muted hover:text-ink",
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                        isActive && "bg-mist",
                      )}
                    >
                      <Icon active={isActive} />
                      {badge > 0 && (
                        <span
                          aria-label={`${badge} waiting`}
                          className="absolute -right-0.5 -top-0.5 min-w-[16px] rounded-full bg-ember px-1 text-center font-mono text-[10px] leading-4 text-white ring-2 ring-paper"
                        >
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </span>
                    <span className={cn(isActive && "font-medium")}>{t.label}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}


/* ── Tab icons ──────────────────────────────────────────────────────────────
   Drawn here rather than pulled from a set: five glyphs is not worth a
   dependency, and "Trips" wants a boot, which no icon library ships. Stroke
   only, 1.6px, filled softly when active so the change reads at a glance. */

type IconProps = { active?: boolean };
const S = (active?: boolean) => ({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: active ? 1.9 : 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

function IconHome({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M3.5 8.6L10 3.5l6.5 5.1V16a.9.9 0 0 1-.9.9h-3.3v-4.4H7.7v4.4H4.4a.9.9 0 0 1-.9-.9z" />
    </svg>
  );
}

function IconInbox({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M3 11.5 5.2 4.4A1 1 0 0 1 6.1 3.7h7.8a1 1 0 0 1 .95.7L17 11.5" />
      <path d="M3 11.5h3.4l.9 1.9h5.4l.9-1.9H17v3.8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconChat({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M17 10.2c0 3-3.1 5.4-7 5.4a8.6 8.6 0 0 1-2.2-.27L4 16.5l1.1-2.6A5 5 0 0 1 3 10.2C3 7.3 6.1 4.8 10 4.8s7 2.5 7 5.4Z" />
    </svg>
  );
}

/** Trips: a boot. Nothing else on the bar says "you are walking somewhere". */
function IconBoot({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <path d="M6.4 3.2h2.4v6.1l4.6 2.2a2.6 2.6 0 0 1 1.5 2.3v1.4a.8.8 0 0 1-.8.8H5.3a.8.8 0 0 1-.8-.8V4a.8.8 0 0 1 .8-.8Z" />
      <path d="M4.5 13.4h10.4" />
    </svg>
  );
}

function IconCalendar({ active }: IconProps) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...S(active)}>
      <rect x="3.2" y="4.8" width="13.6" height="12" rx="1.6" />
      <path d="M3.2 8.4h13.6M7 3.2v3M13 3.2v3" />
    </svg>
  );
}
