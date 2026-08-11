import { Outlet } from "react-router";
import type { Route } from "./+types/_public";
import { Header } from "~/components/public/Header";
import { Footer } from "~/components/public/Footer";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getProfile, getSessionUser } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const [{ data: routes }, { user }] = await Promise.all([
    client.from("routes").select("slug, name").order("name"),
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
  return { routes: routes ?? [], account };
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header account={loaderData.account} />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer routes={loaderData.routes} />
    </div>
  );
}
