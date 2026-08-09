import { Outlet } from "react-router";
import type { Route } from "./+types/_public";
import { Header } from "~/components/public/Header";
import { Footer } from "~/components/public/Footer";
import { createPublicClient, getEnv } from "~/lib/supabase.server";

export async function loader({ context }: Route.LoaderArgs) {
  const client = createPublicClient(getEnv(context));
  const { data: routes } = await client
    .from("routes")
    .select("slug, name")
    .order("name");
  return { routes: routes ?? [] };
}

export default function PublicLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer routes={loaderData.routes} />
    </div>
  );
}
