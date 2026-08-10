import type { Route } from "./+types/sitemap.xml";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { absoluteUrl } from "~/lib/seo";

// Generated per-request from the DB, cached 1h (docs/02 §SEO).
export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const [{ data: guides }, { data: offerings }, { data: routes }] =
    await Promise.all([
      client.from("public_guides").select("slug"),
      client.from("public_offerings").select("slug, kind"),
      client.from("routes").select("slug"),
    ]);

  const paths = [
    "/",
    "/guides",
    "/experiences",
    "/routes",
    "/match",
    "/trust",
    "/insurance",
    "/transparency",
    "/fund",
    "/hosts",
    "/stories",
    "/safety",
    ...(guides ?? []).map((g) => `/guides/${g.slug}`),
    ...(offerings ?? []).map(
      (o) => `/${o.kind === "trek" ? "treks" : "experiences"}/${o.slug}`,
    ),
    ...(routes ?? []).map((r) => `/routes/${r.slug}`),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths
      .map((p) => `  <url><loc>${absoluteUrl(env.SITE_URL, p)}</loc></url>`)
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
