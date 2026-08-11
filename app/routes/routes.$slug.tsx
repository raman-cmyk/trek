import { Link } from "react-router";
import type { Route } from "./+types/routes.$slug";
import {
  pageMeta,
  touristTripLd,
  faqLd,
  breadcrumbLd,
  jsonLd,
  absoluteUrl,
} from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getRouteArticle } from "~/lib/content";
import { useMoney } from "~/lib/currency-context";
import { fmtMetres } from "~/lib/format";
import { SmartImage } from "~/components/SmartImage";
import { OfferingCard, type PublicOffering } from "~/components/public/cards";
import { GuideChip } from "~/components/public/bits";

export function meta({ loaderData: data }: Route.MetaArgs) {
  if (!data) return [{ title: "Route not found" }];
  const tags = [
    ...pageMeta({
      title: data.article?.title ?? `${data.route.name} Trek`,
      description:
        data.article?.meta ??
        `Guides, permits and real costs for the ${data.route.name} trek in Nepal.`,
      canonical: data.canonical,
      image: data.article?.hero,
      type: "article",
    }),
    jsonLd(
      touristTripLd({
        name: `${data.route.name} Trek`,
        url: data.canonical,
        description: data.article?.meta ?? data.route.name,
        image: data.article?.hero,
      }),
    ),
    jsonLd(
      breadcrumbLd([
        { name: "Routes", url: new URL(data.canonical).origin + "/routes" },
        { name: data.route.name, url: data.canonical },
      ]),
    ),
  ];
  if (data.article?.faq.length) tags.push(jsonLd(faqLd(data.article.faq)));
  return tags;
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const { data: route } = await client
    .from("routes")
    .select("id, slug, name, region, typical_days, max_altitude_m, difficulty")
    .eq("slug", params.slug)
    .single();
  if (!route) throw new Response("Route not found", { status: 404 });

  const [{ data: permits }, { data: offerings }] = await Promise.all([
    client
      .from("permits")
      .select("name, cost_usd_cents, cost_npr_paisa, issuing_body, lead_time_days")
      .eq("route_id", route.id),
    client
      .from("public_offerings")
      .select(
        "id, slug, kind, title, summary, days, price_usd_cents, price_breakdown, max_party, cover_photo_url, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents",
      )
      .eq("route_id", route.id),
  ]);

  // Unique guides who lead this route (from its offerings).
  const seen = new Set<string>();
  const guides = ((offerings ?? []) as PublicOffering[]).filter((o) => {
    if (seen.has(o.guide_slug)) return false;
    seen.add(o.guide_slug);
    return true;
  });

  // Related routes (from the article's frontmatter) — SEO interlinks.
  const article = getRouteArticle(params.slug);
  let related: Array<{ slug: string; name: string; region: string; typical_days: number }> = [];
  if (article?.relatedSlugs.length) {
    const { data: rel } = await client
      .from("routes")
      .select("slug, name, region, typical_days")
      .in("slug", article.relatedSlugs);
    related = rel ?? [];
  }

  return {
    route,
    permits: permits ?? [],
    offerings: (offerings ?? []) as PublicOffering[],
    guides,
    article,
    related,
    canonical: absoluteUrl(env.SITE_URL, `/routes/${params.slug}`),
  };
}

export default function RoutePage({ loaderData }: Route.ComponentProps) {
  const { route, permits, offerings, guides, article, related } = loaderData;
  const { m } = useMoney();

  return (
    <main>
      {/* Hero */}
      <div className="relative">
        <SmartImage
          src={article?.hero ?? ""}
          alt={`${route.name} trek`}
          width={1600}
          height={720}

          eager
          className="h-64 w-full sm:h-80"
        />
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent">
          <div className="mx-auto w-full max-w-4xl px-4 pb-6">
            <h1 className="font-display text-4xl text-white">
              {article?.title ?? `${route.name} Trek`}
            </h1>
            <p className="mt-1 text-white/85">
              {route.region} · {route.typical_days} days · up to{" "}
              {fmtMetres(route.max_altitude_m)} · {route.difficulty}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10">
        {/* TOC */}
        {article && article.toc.length > 0 && (
          <nav className="mb-8 rounded-card border border-border bg-card p-4">
            <p className="text-sm font-medium text-ink">On this page</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-primary">
              {article.toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="hover:underline">
                    {t.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Article body */}
        {article ? (
          <article
            className="prose-trek space-y-4 text-ink [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-2xl [&_h3]:mt-4 [&_h3]:font-medium [&_p]:text-ink [&_p]:leading-relaxed"
            dangerouslySetInnerHTML={{ __html: article.html }}
          />
        ) : (
          <p className="text-ink-soft">
            A full guide to the {route.name} trek is coming soon.
          </p>
        )}

        {/* Permit / cost table — always current, from permit data */}
        {permits.length > 0 && (
          <section id="permits-costs" className="mt-10">
            <h2 className="mb-3 font-display text-2xl">Permits &amp; costs</h2>
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="w-full text-sm">
                <thead className="bg-card text-left text-xs uppercase text-ink-soft">
                  <tr>
                    <th className="px-3 py-2 font-medium">Permit</th>
                    <th className="px-3 py-2 font-medium">Issued by</th>
                    <th className="px-3 py-2 font-medium">Lead time</th>
                    <th className="px-3 py-2 text-right font-medium">Cost (pp)</th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2 text-ink-soft">{p.issuing_body}</td>
                      <td className="px-3 py-2 text-ink-soft">
                        {p.lead_time_days}d
                      </td>
                      <td className="px-3 py-2 text-right">
                        {m(p.cost_usd_cents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Costs shown are what we charge you — no markup. Updated from our
              permit data.
            </p>
          </section>
        )}

        {/* Guides who lead this route */}
        {guides.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 font-display text-2xl">Guides who lead this route</h2>
            <div className="flex flex-wrap gap-2">
              {guides.map((g) => (
                <GuideChip
                  key={g.guide_slug}
                  slug={g.guide_slug}
                  name={g.guide_name}
                  avatarUrl={g.guide_avatar_url}
                  tier={g.guide_tier}
                />
              ))}
            </div>
          </section>
        )}

        {/* Offerings on this route */}
        {offerings.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 font-display text-2xl">Trips on this route</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {offerings.map((o) => (
                <OfferingCard key={o.id} offering={o} />
              ))}
            </div>
          </section>
        )}

        {/* Related routes — interlinks (docs/02 §SEO) */}
        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 font-display text-2xl">If you like this route…</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`/routes/${r.slug}`}
                  prefetch="intent"
                  className="rounded-card border border-border bg-card p-4 hover:shadow-card"
                >
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {r.region} · {r.typical_days} days
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* FAQ (visible; JSON-LD is in meta) */}
        {article && article.faq.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 font-display text-2xl">Common questions</h2>
            <div className="space-y-2">
              {article.faq.map((f, i) => (
                <details key={i} className="rounded-card border border-border p-4">
                  <summary className="cursor-pointer font-medium">{f.q}</summary>
                  <p className="mt-2 text-sm text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
