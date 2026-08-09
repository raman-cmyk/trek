import { Form } from "react-router";
import type { Route } from "./+types/guides";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { GuideCard, type PublicGuide } from "~/components/public/cards";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Find your trekking guide in Nepal",
    description:
      "Browse verified, licensed trekking guides in Nepal. Pick the human you'll trek with — filter by language, region, tier and price.",
    canonical: data?.canonical ?? "",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const url = new URL(request.url);
  const q = url.searchParams;
  const fTier = q.get("tier") ?? "";
  const fLang = q.get("lang") ?? "";
  const fDistrict = q.get("district") ?? "";
  const sort = q.get("sort") ?? "recommended";

  const { data: guides } = await client
    .from("public_guides")
    .select(
      "user_id, slug, full_name, avatar_url, home_district, tier, hook_line, day_rate_usd_cents, median_response_mins, years_experience",
    );

  const ids = (guides ?? []).map((g) => g.user_id);
  const [ratings, langMap] = await Promise.all([
    guideRatings(client, ids),
    (async () => {
      const map: Record<string, string[]> = {};
      if (ids.length) {
        const { data } = await client
          .from("guide_languages")
          .select("guide_id, language")
          .in("guide_id", ids);
        for (const l of data ?? []) (map[l.guide_id] ??= []).push(l.language);
      }
      return map;
    })(),
  ]);

  let rows = (guides ?? []) as (PublicGuide & { years_experience: number | null })[];
  if (fTier) rows = rows.filter((g) => String(g.tier) === fTier);
  if (fDistrict) rows = rows.filter((g) => g.home_district === fDistrict);
  if (fLang) rows = rows.filter((g) => (langMap[g.user_id] ?? []).includes(fLang));

  rows.sort((a, b) => {
    if (sort === "price")
      return (a.day_rate_usd_cents ?? 0) - (b.day_rate_usd_cents ?? 0);
    if (sort === "experience")
      return (b.years_experience ?? 0) - (a.years_experience ?? 0);
    // recommended: tier desc, then rating desc
    const rt = (ratings[b.user_id]?.value ?? 0) - (ratings[a.user_id]?.value ?? 0);
    return b.tier - a.tier || rt;
  });

  const districts = [
    ...new Set((guides ?? []).map((g) => g.home_district).filter(Boolean)),
  ].sort() as string[];
  const languages = [
    ...new Set(Object.values(langMap).flat()),
  ].sort();

  return {
    guides: rows,
    ratings,
    langMap,
    facets: { districts, languages },
    filters: { fTier, fLang, fDistrict, sort },
    canonical: absoluteUrl(env.SITE_URL, "/guides"),
  };
}

export default function Guides({ loaderData }: Route.ComponentProps) {
  const { guides, ratings, langMap, facets, filters } = loaderData;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl text-ink">Find your guide</h1>
      <p className="mt-1 text-ink-soft">{guides.length} verified guides</p>

      <Form
        method="get"
        className="mt-5 flex flex-wrap gap-2"
        onChange={(e) => e.currentTarget.requestSubmit()}
      >
        <select
          name="tier"
          defaultValue={filters.fTier}
          className="rounded-button border border-border px-3 py-2 text-sm"
        >
          <option value="">Any tier</option>
          <option value="1">✓ Verified</option>
          <option value="2">✓✓ Trusted</option>
          <option value="3">★ Elite</option>
        </select>
        <select
          name="lang"
          defaultValue={filters.fLang}
          className="rounded-button border border-border px-3 py-2 text-sm"
        >
          <option value="">Any language</option>
          {facets.languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          name="district"
          defaultValue={filters.fDistrict}
          className="rounded-button border border-border px-3 py-2 text-sm"
        >
          <option value="">Any district</option>
          {facets.districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="rounded-button border border-border px-3 py-2 text-sm"
        >
          <option value="recommended">Recommended</option>
          <option value="price">Price</option>
          <option value="experience">Most experienced</option>
        </select>
        <noscript>
          <button className="rounded-button bg-primary px-3 py-2 text-sm text-white">
            Apply
          </button>
        </noscript>
      </Form>

      {guides.length === 0 ? (
        <p className="mt-10 text-ink-soft">
          No guides match those filters. Try widening them.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {guides.map((g) => (
            <GuideCard
              key={g.user_id}
              guide={g}
              rating={ratings[g.user_id]}
              languages={langMap[g.user_id]}
            />
          ))}
        </div>
      )}
    </main>
  );
}
