import { Form, NavLink, Outlet, data, redirect } from "react-router";
import type { Route } from "./+types/g";
import { cn } from "~/lib/cn";
import { createSupabaseServerClient, getEnv } from "~/lib/supabase.server";
import { requireUser } from "~/lib/auth.server";

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
  return data(
    {
      name: profile.full_name,
      status: guide?.status ?? "applied",
      enquiryCount: enquiryCount ?? 0,
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

const TABS = [
  { to: "/g", label: "Home", end: true, badge: 0 },
  { to: "/g/enquiries", label: "Enquiries", badge: "enquiryCount" as const },
  { to: "/g/bookings", label: "Trips", badge: 0 },
  { to: "/g/calendar", label: "Calendar", badge: 0 },
  { to: "/g/earnings", label: "Earnings", badge: 0 },
];

export default function GuideLayout({ loaderData }: Route.ComponentProps) {
  const { status, enquiryCount } = loaderData;
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
        <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-border bg-card">
          {TABS.map((t) => {
            const badge = t.badge === "enquiryCount" ? enquiryCount : 0;
            return (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                prefetch="intent"
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-1 flex-col items-center py-2.5 text-xs",
                    isActive ? "font-medium text-primary" : "text-ink-soft",
                  )
                }
              >
                {t.label}
                {badge > 0 && (
                  <span className="absolute right-1/4 top-1 rounded-full bg-primary px-1.5 text-[10px] text-white">
                    {badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
