import { Link } from "react-router";
import type { Route } from "./+types/routes._index";
import { pageMeta, breadcrumbLd, jsonLd, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { getRouteArticle } from "~/lib/content";
import { fromPerPersonUsdCents, type PriceBreakdown } from "~/lib/experience-pricing";
import { monthName } from "~/lib/match";
import { useMoney } from "~/lib/currency-context";
import { SmartImage } from "~/components/SmartImage";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return [
    ...pageMeta({
      title: "Nepal trekking routes — days, altitude, permits & real costs",
      description:
        "Every route we run: Everest Base Camp, Annapurna Circuit, Langtang, Manaslu, Gokyo and Mardi Himal — with honest difficulty, live permit costs, and the verified guides who lead them.",
      canonical: (data as any)?.canonical ?? "",
    }),
    jsonLd(
      breadcrumbLd([{ name: "Routes", url: (data as any)?.canonical ?? "" }]),
    ),
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);

  const [{ data: routes }, { data: offerings }] = await Promise.all([
    client
      .from("routes")
      .select("id, slug, name, region, typical_days, max_altitude_m, difficulty, season_months")
      .order("typical_days", { ascending: false }),
    client
      .from("public_offerings")
      .select("route_id, guide_id, price_usd_cents, price_breakdown, max_party"),
  ]);

  const cards = (routes ?? []).map((r) => {
    const own = (offerings ?? []).filter((o) => o.route_id === r.id);
    const guideCount = new Set(own.map((o) => o.guide_id)).size;
    let from: number | null = null;
    for (const o of own) {
      const bd = (o.price_breakdown ?? null) as PriceBreakdown | null;
      const price = bd?.guide_fee_total_usd_cents
        ? fromPerPersonUsdCents(bd, (o as any).max_party)
        : (o.price_usd_cents ?? null);
      if (price != null && (from == null || price < from)) from = price;
    }
    const article = getRouteArticle(r.slug);
    return {
      ...r,
      guideCount,
      fromUsdCents: from,
      hero: article?.hero ?? null,
      teaser: article?.meta ?? null,
    };
  });

  return { cards, canonical: absoluteUrl(env.SITE_URL, "/routes") };
}

function seasonLabel(months: number[] | null): string {
  if (!months || months.length === 0) return "";
  // Compress into "Mar–May · Oct–Nov" style ranges.
  const sorted = [...months].sort((a, b) => a - b);
  const ranges: Array<[number, number]> = [];
  for (const m of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else ranges.push([m, m]);
  }
  return ranges
    .map(([a, b]) =>
      a === b ? monthName(a).slice(0, 3) : `${monthName(a).slice(0, 3)}–${monthName(b).slice(0, 3)}`,
    )
    .join(" · ");
}

export default function RoutesIndex({ loaderData }: Route.ComponentProps) {
  const { cards } = loaderData as any;
  const { m } = useMoney();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <p className="label text-muted">Routes</p>
      <h1 className="mt-2 font-display text-display-l text-ink">
        Six routes. Zero brochure clichés.
      </h1>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        Every route we run, with honest difficulty, live permit costs, and the
        named guides who lead it. Pick the mountain — then pick the human.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {cards.map((r: any) => (
          <Link
            key={r.slug}
            to={`/routes/${r.slug}`}
            prefetch="intent"
            className="group overflow-hidden rounded-card border border-border bg-card hover:shadow-card"
          >
            <SmartImage
              src={r.hero ?? ""}
              alt={`${r.name} trek`}
              width={800}
              height={360}
              className="h-40 w-full"
            />
            <div className="p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-xl text-ink group-hover:text-primary">
                  {r.name}
                </h2>
                {r.fromUsdCents != null && (
                  <span className="whitespace-nowrap font-mono text-sm text-ink">
                    from {m(r.fromUsdCents)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {r.region} · {r.typical_days} days · to {r.max_altitude_m.toLocaleString("en-US")}m ·{" "}
                <span className="capitalize">{r.difficulty}</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Season: {seasonLabel(r.season_months)}
                {r.guideCount > 0 &&
                  ` · ${r.guideCount} verified guide${r.guideCount === 1 ? "" : "s"}`}
              </p>
              {r.teaser && (
                <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{r.teaser}</p>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-card border border-accent/30 bg-accent/5 p-5">
        <p className="text-ink">
          <span className="font-medium">Not sure which route?</span>{" "}
          <Link to="/match" className="text-primary hover:underline">
            Answer 5 questions
          </Link>{" "}
          and we'll match you with the guides — and routes — that fit.
        </p>
      </div>
    </main>
  );
}
