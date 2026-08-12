import { Outlet } from "react-router";
import { organizationLd } from "~/lib/seo";
import type { Route } from "./+types/_public";
import { Header } from "~/components/public/Header";
import { Footer } from "~/components/public/Footer";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const [{ data: routes }, { data: faces }, { count: journalCount }, { user }] =
    await Promise.all([
      // region + altitude group the footer's route list; day_stops draws the
      // profile the footer's top edge is cut from.
      client
        .from("routes")
        .select("slug, name, region, max_altitude_m, typical_days, day_stops")
        .order("name"),
      // The face wall. Ordered by user_id rather than at random so the strip
      // is stable across a session — a footer that reshuffles on every
      // navigation reads as a glitch, not as life.
      client
        .from("public_guides")
        .select("user_id, slug, full_name, avatar_url")
        .order("user_id"),
      client
        .from("public_journals")
        .select("id", { count: "exact", head: true }),
      getSessionUser(request, env),
    ]);
  // Reflect the signed-in customer in the header (trips + sign out + unread).
  let account: { firstName: string; role: string; unread: number } | null = null;
  if (user) {
    const profile = await getProfile(env, user.id);
    if (profile) {
      const { createAdminClient } = await import("~/lib/supabase.server");
      const { countUnread } = await import("~/lib/unread.server");
      const { unreadTotal } = await countUnread(createAdminClient(env), user.id);
      account = {
        firstName: (profile.full_name ?? "").split(" ")[0] || "You",
        role: profile.role,
        unread: unreadTotal,
      };
    }
  }
  return {
    origin: new URL(request.url).origin,
    routes: routes ?? [],
    footer: {
      faces: (faces ?? []).map((g) => ({
        slug: g.slug,
        name: g.full_name,
        avatar_url: g.avatar_url,
      })),
      guideCount: (faces ?? []).length,
      journalCount: journalCount ?? 0,
      routeCount: (routes ?? []).length,
    },
    account,
  };
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* The publisher node, once for the whole public site — an agent
          resolving "who is Trek" follows the @id from any page.

          Rendered here rather than from this layout's `meta` export: a child
          route's meta replaces its parent's wholesale, so every page that
          exports its own meta (which is all of them) silently dropped it. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(organizationLd(loaderData.origin)),
        }}
      />
      <Header account={loaderData.account} />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer routes={loaderData.routes} data={loaderData.footer} />
    </div>
  );
}
