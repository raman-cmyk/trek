import { Link } from "react-router";
import type { Route } from "./+types/guides";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { guideRatings } from "~/lib/ratings.server";
import { GuideCard, type PublicGuide } from "~/components/public/cards";
import { BrowseSearch } from "~/components/public/BrowseSearch";
import {
  escapeLike,
  guideIdsMatchingText,
  guideMatchesText,
  openRunsByGuide,
  parseRange,
} from "~/lib/browse.server";
import { findIntent, matchesKeywords } from "~/lib/intents";
import { fmtDateShort } from "~/lib/format";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Find your trekking guide in Nepal",
    description:
      "Search verified, licensed trekking guides in Nepal by name, region, language and the dates you're free. Pick the person you'll walk with.",
    canonical: data?.canonical ?? "",
  });
}

const GUIDE_COLS =
  "user_id, slug, full_name, avatar_url, home_district, tier, hook_line, bio, only_with_me, day_rate_usd_cents, median_response_mins, years_experience, gender";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const url = new URL(request.url);
  const p = url.searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const q = (p.get("q") ?? "").trim().slice(0, 80);
  const range = parseRange(p.get("from"), p.get("to"), today);
  const fTier = p.get("tier") ?? "";
  const fLang = p.get("lang") ?? "";
  const fDistrict = p.get("district") ?? "";
  const fWomen = p.get("women") === "1";
  const sort = p.get("sort") ?? "recommended";
  // Homepage "browse by intent" rows land here — every row is this same page
  // with one more filter, so a row and its "see all" can never disagree.
  const intent = findIntent(p.get("intent"));

  // Text search runs in two halves and unions: the guide's own record, and the
  // guides who lead a matching route or run a matching trip. "Annapurna" is
  // the second half — nothing on a guide row says Annapurna.
  type Row = PublicGuide & { bio: string | null; years_experience: number | null; gender: string | null };
  let rows: Row[];
  let viaTrips = new Set<string>();
  if (q) {
    const like = `%${escapeLike(q)}%`;
    const [{ data: direct }, matched] = await Promise.all([
      client
        .from("public_guides")
        .select(GUIDE_COLS)
        .or(
          `full_name.ilike.${like},home_district.ilike.${like},hook_line.ilike.${like},only_with_me.ilike.${like},bio.ilike.${like}`,
        ),
      guideIdsMatchingText(client, q),
    ]);
    viaTrips = matched;
    const byId = new Map<string, Row>();
    for (const g of (direct ?? []) as Row[]) byId.set(g.user_id, g);
    const missing = [...viaTrips].filter((id) => !byId.has(id));
    if (missing.length) {
      const { data: extra } = await client
        .from("public_guides")
        .select(GUIDE_COLS)
        .in("user_id", missing);
      for (const g of (extra ?? []) as Row[]) byId.set(g.user_id, g);
    }
    rows = [...byId.values()];
  } else {
    const { data } = await client.from("public_guides").select(GUIDE_COLS);
    rows = (data ?? []) as Row[];
  }

  // Facets are built from the unfiltered set so the dropdowns don't shrink to
  // whatever the current search happens to have left.
  const { data: allGuides } = await client
    .from("public_guides")
    .select("user_id, home_district");
  const totalGuides = (allGuides ?? []).length;

  const ids = rows.map((g) => g.user_id);
  const [ratings, langMap, allLangs, freeRuns] = await Promise.all([
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
    client.from("guide_languages").select("language"),
    range ? openRunsByGuide(client, range, ids) : Promise.resolve(null),
  ]);

  if (fTier) rows = rows.filter((g) => String(g.tier) === fTier);
  if (fDistrict) rows = rows.filter((g) => g.home_district === fDistrict);
  if (fWomen) rows = rows.filter((g) => g.gender === "female");
  if (fLang) rows = rows.filter((g) => (langMap[g.user_id] ?? []).includes(fLang));
  // "Free between X and Y" = at least one open day in the window. Trip-length
  // fit is the offering's job (a guide free for 3 of your 16 days is still a
  // useful result on a page about people).
  if (freeRuns) rows = rows.filter((g) => (freeRuns[g.user_id] ?? 0) >= 1);
  // Belt-and-braces: `ilike` is accent- and case-insensitive but not word-aware,
  // so re-check each survivor against the same rule the union used.
  if (q) rows = rows.filter((g) => guideMatchesText(g, q) || viaTrips.has(g.user_id));

  if (intent) {
    if (intent.gender) rows = rows.filter((g) => g.gender === intent.gender);
    if (intent.keywords) rows = rows.filter((g) => matchesKeywords(g, intent.keywords!));
    if (intent.languages) {
      rows = rows.filter((g) =>
        (langMap[g.user_id] ?? []).some((l) => intent.languages!.includes(l)),
      );
    }
    if (intent.region) {
      const inRegion = await guideIdsMatchingText(client, intent.region);
      rows = rows.filter((g) => inRegion.has(g.user_id));
    }
  }

  rows.sort((a, b) => {
    if (sort === "price") return (a.day_rate_usd_cents ?? 0) - (b.day_rate_usd_cents ?? 0);
    if (sort === "experience") return (b.years_experience ?? 0) - (a.years_experience ?? 0);
    const rt = (ratings[b.user_id]?.value ?? 0) - (ratings[a.user_id]?.value ?? 0);
    return b.tier - a.tier || rt;
  });

  const districts = [
    ...new Set((allGuides ?? []).map((g) => g.home_district).filter(Boolean)),
  ].sort() as string[];
  const languages = [
    ...new Set((allLangs.data ?? []).map((l) => l.language)),
  ].sort();

  return {
    guides: rows,
    ratings,
    langMap,
    totalGuides,
    facets: { districts, languages },
    filters: { q, from: range?.from ?? "", to: range?.to ?? "", fTier, fLang, fDistrict, fWomen, sort },
    intent: intent ? { key: intent.key, label: intent.label, blurb: intent.blurb } : null,
    today,
    canonical: absoluteUrl(env.SITE_URL, "/guides"),
  };
}

const SELECT_CLS =
  "rounded border border-line bg-card px-3 py-2 text-sm text-ink";

export default function Guides({ loaderData }: Route.ComponentProps) {
  const { guides, ratings, langMap, totalGuides, facets, filters, intent, today } = loaderData;
  const narrowed =
    !!filters.q ||
    !!filters.from ||
    !!filters.fTier ||
    !!filters.fLang ||
    !!filters.fDistrict ||
    !!intent ||
    filters.fWomen;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {intent && <p className="label text-muted">{intent.blurb}</p>}
      <h1 className="font-display text-3xl text-ink">
        {intent ? intent.label : "Find your guide"}
      </h1>
      <p className="mt-1 text-muted">
        {narrowed ? (
          <>
            <span className="font-mono text-ink">{guides.length}</span> of{" "}
            <span className="font-mono text-ink">{totalGuides}</span> verified guides
          </>
        ) : (
          <>
            <span className="font-mono text-ink">{totalGuides}</span> verified guides,
            and more joining every week
          </>
        )}
      </p>

      <BrowseSearch
        q={filters.q}
        from={filters.from}
        to={filters.to}
        today={today}
        placeholder="Annapurna, Sherpa, German, Pokhara…"
        dateLabel="Free between"
        hidden={{ intent: intent?.key ?? "" }}
      >
        <label className="flex cursor-pointer items-center gap-2 rounded border border-line bg-card px-3 py-2 text-sm text-ink has-[:checked]:border-moss has-[:checked]:bg-moss/10">
          <input
            type="checkbox"
            name="women"
            value="1"
            defaultChecked={filters.fWomen}
            className="accent-moss"
          />
          Women guides
        </label>
        <select name="tier" defaultValue={filters.fTier} className={SELECT_CLS}>
          <option value="">Any tier</option>
          <option value="1">✓ Verified</option>
          <option value="2">✓✓ Trusted</option>
          <option value="3">★ Elite</option>
        </select>
        <select name="lang" defaultValue={filters.fLang} className={SELECT_CLS}>
          <option value="">Any language</option>
          {facets.languages.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select name="district" defaultValue={filters.fDistrict} className={SELECT_CLS}>
          <option value="">Any district</option>
          {facets.districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={filters.sort} className={SELECT_CLS}>
          <option value="recommended">Recommended</option>
          <option value="price">Price</option>
          <option value="experience">Most experienced</option>
        </select>
        {narrowed && (
          <Link
            to="/guides"
            className="self-center px-2 py-2 text-sm text-moss underline underline-offset-4"
          >
            Clear
          </Link>
        )}
      </BrowseSearch>

      {filters.from && (
        <p className="mt-2 text-caption text-muted">
          Showing guides with open days between {fmtDateShort(filters.from)} and{" "}
          {fmtDateShort(filters.to)}.
        </p>
      )}

      <Link
        to="/match"
        prefetch="intent"
        className="mt-4 inline-block rounded border border-line bg-mist px-4 py-2.5 text-sm text-ink hover:border-sage"
      >
        <span className="font-medium">Not sure who fits?</span> Answer 5 questions and we'll
        match you →
      </Link>

      {guides.length === 0 ? (
        <div className="mt-10">
          <p className="font-display text-xl text-ink">
            No one&rsquo;s free those exact days.
          </p>
          <p className="mt-1 max-w-[52ch] text-muted">
            Try the week either side, or widen the region — most guides work
            across more than one.
          </p>
          <Link
            to="/guides"
            className="mt-3 inline-block rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
          >
            Show all {totalGuides} guides
          </Link>
        </div>
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
