import type { Route } from "./+types/sitemap.xml";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { absoluteUrl } from "~/lib/seo";

/**
 * The sitemap, generated per request from the database and cached an hour.
 *
 * Every URL carries a <lastmod> taken from the row it came from, so a crawler
 * can tell a guide profile edited this morning from one untouched since
 * launch. The date column differs by content type — guides, trips and events
 * carry updated_at (moved by a `touch` trigger on every write), journals
 * carry published_at, routes and recaps only created_at — so each query asks
 * for the best date that type actually has. Nothing is invented: a URL with
 * no real date ships without a lastmod rather than with today's, because a
 * sitemap that claims everything changed today is one a crawler learns to
 * ignore.
 */
export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const [{ data: guides }, { data: offerings }, { data: routes }, { data: events }] =
    await Promise.all([
      client.from("public_guides").select("slug, updated_at"),
      client.from("public_offerings").select("slug, kind, updated_at"),
      client.from("routes").select("slug, created_at"),
      client.from("public_events").select("slug, updated_at"),
    ]);
  // Journals are the freshness engine — new dated writing on every route.
  const { data: journals } = await client
    .from("public_journals")
    .select("slug, published_at")
    .limit(1000);
  // Public recaps are indexable long-tail content with OG images.
  const { data: recaps } = await client
    .from("recaps")
    .select("slug, created_at")
    .eq("visible", true)
    .limit(500);

  /** W3C date, which is all <lastmod> wants. Undefined drops the tag. */
  const day = (v: string | null | undefined) =>
    v ? new Date(v).toISOString().slice(0, 10) : undefined;

  interface Entry {
    path: string;
    lastmod?: string;
  }

  // The static pages have no row behind them, so no honest lastmod. The
  // browse pages are the exception: they are a window onto the catalogue, so
  // they are as fresh as the freshest thing in them.
  const freshest = (rows: Array<{ updated_at?: string | null }> | null | undefined) =>
    day(
      (rows ?? [])
        .map((r) => r.updated_at ?? null)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1),
    );

  const entries: Entry[] = [
    { path: "/", lastmod: freshest(guides) },
    { path: "/guides", lastmod: freshest(guides) },
    { path: "/experiences", lastmod: freshest(offerings) },
    { path: "/routes" },
    { path: "/match" },
    { path: "/trust" },
    { path: "/insurance" },
    { path: "/transparency" },
    { path: "/fund" },
    { path: "/hosts" },
    { path: "/stories" },
    { path: "/journals" },
    { path: "/events", lastmod: freshest(events) },
    { path: "/safety" },

    ...(guides ?? []).map((g) => ({
      path: `/guides/${g.slug}`,
      lastmod: day(g.updated_at),
    })),
    ...(offerings ?? []).map((o) => ({
      path: `/${o.kind === "trek" ? "treks" : "experiences"}/${o.slug}`,
      lastmod: day(o.updated_at),
    })),
    ...(routes ?? []).map((r) => ({
      path: `/routes/${r.slug}`,
      lastmod: day(r.created_at),
    })),
    ...(events ?? []).map((e) => ({
      path: `/events/${e.slug}`,
      lastmod: day(e.updated_at),
    })),
    ...(recaps ?? []).map((r) => ({
      path: `/recap/${r.slug}`,
      lastmod: day(r.created_at),
    })),
    ...(journals ?? []).map((j) => ({
      path: `/journals/${j.slug}`,
      lastmod: day(j.published_at),
    })),
  ];

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries
      .map(
        (e) =>
          `  <url><loc>${absoluteUrl(env.SITE_URL, e.path)}</loc>` +
          (e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : "") +
          `</url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
