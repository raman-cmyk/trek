import type { Route } from "./+types/robots.txt";
import { getEnv } from "~/lib/supabase.server";
import { absoluteUrl } from "~/lib/seo";

export function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /ops",
    "Disallow: /_dev",
    "Disallow: /g",
    "Disallow: /trips",
    "Disallow: /checkout",
    "Disallow: /messages",
    "Disallow: /conversations",
    "Disallow: /pdf",
    "Disallow: /api",
    "Disallow: /logout",
    "",
    `Sitemap: ${absoluteUrl(env.SITE_URL, "/sitemap.xml")}`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
