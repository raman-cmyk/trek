import { Form, NavLink, Outlet, data, redirect } from "react-router";
import type { Route } from "./+types/ops";
import { cn } from "~/lib/cn";
import {
  createSupabaseServerClient,
  getEnv,
  requireOps,
} from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const { profile, admin, headers } = await requireOps(request, env);

  const [verifs, incidents, payouts, flags, pendingPhotos] = await Promise.all([
    admin
      .from("guides")
      .select("user_id", { count: "exact", head: true })
      .in("status", ["applied", "in_review"]),
    admin
      .from("incidents")
      .select("id", { count: "exact", head: true })
      .neq("status", "closed"),
    admin
      .from("payouts")
      .select("id", { count: "exact", head: true })
      .eq("status", "payable"),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .not("flagged_reason", "is", null),
    admin
      .from("offering_photos")
      .select("id", { count: "exact", head: true })
      .eq("approved", false)
      .eq("source", "trekker"),
  ]);

  return data(
    {
      profile,
      counts: {
        verifications: verifs.count ?? 0,
        incidents: incidents.count ?? 0,
        payouts: payouts.count ?? 0,
        moderation: (flags.count ?? 0) + (pendingPhotos.count ?? 0),
      },
    },
    { headers },
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  // Logout.
  const env = getEnv(context);
  const { supabase, headers } = createSupabaseServerClient(request, env);
  await supabase.auth.signOut();
  return redirect("/ops/login", { headers });
}

// Grouped by the job being done, not by the order the pages were built.
// Journals had no nav entry at all — the page existed and was reachable only
// by typing the URL.
const NAV = [
  { group: "", items: [{ to: "/ops", label: "Today", badge: null, end: true }] },
  {
    group: "Work",
    items: [
      { to: "/ops/verifications", label: "Verifications", badge: "verifications" },
      { to: "/ops/pipeline", label: "Pipeline", badge: null },
      { to: "/ops/permits", label: "Permits", badge: null },
      { to: "/ops/contracts", label: "Contracts", badge: null },
      { to: "/ops/events", label: "Group trips", badge: null },
    ],
  },
  {
    group: "Money",
    items: [{ to: "/ops/payouts", label: "Payouts", badge: "payouts" }],
  },
  {
    group: "Safety",
    items: [
      { to: "/ops/incidents", label: "Incidents", badge: "incidents" },
      { to: "/ops/moderation", label: "Moderation", badge: "moderation" },
    ],
  },
  {
    group: "Content",
    items: [{ to: "/ops/journals", label: "Journals", badge: null }],
  },
  {
    group: "System",
    items: [{ to: "/ops/data", label: "Data", badge: null }],
  },
] as const;

export default function OpsLayout({ loaderData }: Route.ComponentProps) {
  const { profile, counts } = loaderData;
  return (
    <div className="min-h-screen bg-surface text-ink">
      <div className="flex">
        <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-border bg-card">
          <div className="border-b border-border px-4 py-4">
            <p className="font-display text-lg">Trek Ops</p>
            <p className="text-xs text-ink-soft">Grey Floor</p>
          </div>
          {/* The find-anybody box. GET, so a search is a URL that can be
              shared with whoever is on shift. */}
          <Form method="get" action="/ops/search" className="border-b border-border p-2">
            <input
              name="q"
              type="search"
              placeholder="Find anyone…"
              className="w-full rounded border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
          </Form>
          <nav className="flex-1 space-y-3 overflow-y-auto p-2">
            {NAV.map((section) => (
              <div key={section.group || "top"}>
                {section.group && (
                  <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-soft/70">
                    {section.group}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item: any) => {
                    const count = item.badge
                      ? counts[item.badge as keyof typeof counts]
                      : 0;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end ?? false}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center justify-between rounded-md px-3 py-1.5 text-sm",
                            isActive
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-ink-soft hover:bg-black/5",
                          )
                        }
                      >
                        <span>{item.label}</span>
                        {count > 0 && (
                          <span className="rounded-full bg-primary px-1.5 text-xs text-white">
                            {count}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-border p-3 text-sm">
            <p className="truncate text-ink-soft">{profile.full_name}</p>
            <Form method="post">
              <button className="mt-1 text-xs text-primary hover:underline">
                Sign out
              </button>
            </Form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
