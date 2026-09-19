import { Link } from "react-router";
import { guideRatings } from "~/lib/ratings.server";
import { photosByOffering } from "~/lib/offering-photos.server";
import { toCardOffering } from "~/lib/card-offering";
import type { Route } from "./+types/experiences";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { OfferingCard, type PublicOffering } from "~/components/public/cards";
import { BrowseSearch } from "~/components/public/BrowseSearch";
import { FilterSheet } from "~/components/public/FilterSheet";
import { escapeLike, openRunsByGuide, parseRange } from "~/lib/browse.server";
import { fmtDateShort } from "~/lib/format";
import { Chip } from "~/components/design/Chip";
import { KIND_GLYPH } from "~/components/public/cards";
import { BookingAssurance } from "~/components/public/BookingAssurance";

export { publicCacheHeaders as headers } from "~/lib/cache-headers";


const CATEGORIES = [
  { kind: "", label: "All" },
  { kind: "trek", label: "Treks" },
  { kind: "day_hike", label: "Day hikes" },
  { kind: "food_culture", label: "Food & culture" },
  { kind: "adventure", label: "Adventure" },
  { kind: "city", label: "City" },
] as const;

/**
 * Bands, not sliders.
 *
 * "Two weeks off" is how somebody plans a trip; 11.5 days is not. Bands also
 * survive being in a URL, which a slider position does not, so a filtered
 * page stays a link somebody can send.
 */
const LENGTH_BANDS = [
  { value: "1", label: "One day", min: 1, max: 1 },
  { value: "2-7", label: "2 to 7 days", min: 2, max: 7 },
  { value: "8-14", label: "8 to 14 days", min: 8, max: 14 },
  { value: "15", label: "15 days or more", min: 15, max: Infinity },
];

const PRICE_BANDS = [
  { value: "0-50", label: "Under $50", min: 0, max: 49 },
  { value: "50-150", label: "$50 to $150", min: 50, max: 150 },
  { value: "150-600", label: "$150 to $600", min: 150, max: 600 },
  { value: "600", label: "$600 and up", min: 600, max: Infinity },
];

function inBand(
  bands: { value: string; min: number; max: number }[],
  value: string,
  n: number,
): boolean {
  const b = bands.find((x) => x.value === value);
  return !!b && n >= b.min && n <= b.max;
}

const OFFERING_COLS =
  "id, slug, kind, route_id, title, summary, days, price_usd_cents, price_breakdown, max_party, min_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents, guide_years_experience, route_slug, route_name";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Browse experiences in Nepal — treks, day hikes, food & culture",
    description:
      "Every experience is led by a specific, verified guide. Search multi-day treks, day hikes, food walks, adventures and city tours by region and by the dates you can travel.",
    canonical: data?.canonical ?? "",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const p = new URL(request.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const kind = p.get("kind") ?? "";
  const q = (p.get("q") ?? "").trim().slice(0, 80);
  const range = parseRange(p.get("from"), p.get("to"), today);
  // Length and price, as bands rather than sliders: "8 to 14 days" is how
  // somebody with two weeks off actually thinks, and a slider on a phone is
  // a fight. Applied after the query because the rows are already here.
  const lengthBands = p.getAll("length").filter((v) => LENGTH_BANDS.some((b) => b.value === v));
  const priceBands = p.getAll("price").filter((v) => PRICE_BANDS.some((b) => b.value === v));
  const partyRaw = Number(p.get("party"));
  const party = Number.isFinite(partyRaw) && partyRaw >= 1 ? Math.min(16, Math.floor(partyRaw)) : 0;

  let query = client.from("public_offerings").select(OFFERING_COLS);
  if (kind) query = query.eq("kind", kind);
  // Party size is a hard constraint, not a preference: a trip capped at 6
  // cannot take 8, and a restricted-area trek that needs 2 cannot take 1.
  if (party) query = query.gte("max_party", party).lte("min_party", party);
  if (q) {
    // Route names/regions aren't on the offering row, so resolve them to ids
    // first and OR that in — "Annapurna" has to find the Annapurna trips.
    const like = `%${escapeLike(q)}%`;
    const { data: routes } = await client
      .from("routes")
      .select("id")
      .or(`name.ilike.${like},region.ilike.${like}`);
    const routeIds = (routes ?? []).map((r) => r.id);
    const clauses = [`title.ilike.${like}`, `summary.ilike.${like}`];
    if (routeIds.length) clauses.push(`route_id.in.(${routeIds.join(",")})`);
    query = query.or(clauses.join(","));
  }
  let offerings = ((await query).data ?? []) as (PublicOffering & {
    guide_id: string;
    route_id: string | null;
  })[];

  // A guide's name is a legitimate search on this page too, and it isn't a
  // column we can OR into the query above without a join.
  if (q) {
    const { data: named } = await client
      .from("public_guides")
      .select("user_id")
      .ilike("full_name", `%${escapeLike(q)}%`);
    const namedIds = new Set((named ?? []).map((g) => g.user_id));
    if (namedIds.size) {
      let byGuide = client.from("public_offerings").select(OFFERING_COLS).in("guide_id", [...namedIds]);
      if (kind) byGuide = byGuide.eq("kind", kind);
      if (party) byGuide = byGuide.gte("max_party", party).lte("min_party", party);
      const { data: extra } = await byGuide;
      const seen = new Set(offerings.map((o) => o.id));
      for (const o of (extra ?? []) as typeof offerings) {
        if (!seen.has(o.id)) offerings.push(o);
      }
    }
  }

  // Dates: the guide must have a run of open days long enough for the trip.
  // A 14-day trek needs 14 consecutive free days inside your window, not one.
  if (range) {
    const runs = await openRunsByGuide(
      client,
      range,
      [...new Set(offerings.map((o) => o.guide_id))],
    );
    offerings = offerings.filter((o) => (runs[o.guide_id] ?? 0) >= Math.max(1, o.days));
  }

  if (lengthBands.length) {
    offerings = offerings.filter((o) =>
      lengthBands.some((b) => inBand(LENGTH_BANDS, b, o.days ?? 0)),
    );
  }
  if (priceBands.length) {
    offerings = offerings.filter((o) =>
      priceBands.some((b) => inBand(PRICE_BANDS, b, Math.round((o.price_usd_cents ?? 0) / 100))),
    );
  }

  const { count: totalCount } = await client
    .from("public_offerings")
    .select("id", { count: "exact", head: true });

  // What other people said about each guide on this page. One query for the
  // whole grid — the card line that used to read "per person · less in a
  // group" says this instead.
  // ...and every picture each trip has beyond its cover, for the slider on
  // the card. One batched select for the whole grid, the same shape as the
  // ratings query above (offering-photos.server.ts).
  const [ratings, photos] = await Promise.all([
    guideRatings(client, [...new Set(offerings.map((o: any) => o.guide_id).filter(Boolean))]),
    photosByOffering(client, offerings.map((o: any) => o.id)),
  ]);

  return {
    ratings,
    photos,
    // Trimmed for the same reason as the homepage — see card-offering.ts.
    offerings: offerings.map(toCardOffering),
    total: totalCount ?? offerings.length,
    kind,
    filters: { q, from: range?.from ?? "", to: range?.to ?? "", party },
    search: new URL(request.url).search,
    today,
    canonical: absoluteUrl(env.SITE_URL, "/experiences"),
  };
}

export default function Experiences({ loaderData }: Route.ComponentProps) {
  const { offerings, total, kind, filters, today, search, ratings, photos } = loaderData;
  const params = new URLSearchParams(search);
  // Built here rather than in the component so the options can carry counts
  // from the rows that are actually on the page.
  const groups = [
    {
      param: "kind",
      title: "Kind of trip",
      type: "one" as const,
      anyLabel: "Any kind",
      options: CATEGORIES.filter((c) => c.kind).map((c) => ({
        value: c.kind,
        label: c.label,
      })),
    },
    {
      param: "length",
      title: "How long",
      type: "many" as const,
      options: LENGTH_BANDS.map((b) => ({ value: b.value, label: b.label })),
    },
    {
      param: "price",
      title: "Price per person",
      type: "many" as const,
      options: PRICE_BANDS.map((b) => ({ value: b.value, label: b.label })),
    },
    {
      param: "party",
      title: "How many of you",
      type: "one" as const,
      anyLabel: "Any size",
      options: [
        { value: "1", label: "Just me" },
        { value: "2", label: "Two of us" },
        { value: "4", label: "Four" },
        { value: "6", label: "Six" },
        { value: "8", label: "Eight or more" },
      ],
    },
  ];
  const narrowed = !!filters.q || !!filters.from || !!filters.party || !!kind;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl text-ink">Browse experiences</h1>
      <p className="mt-1 text-muted">
        {narrowed ? (
          <>
            <span className="font-mono text-ink">{offerings.length}</span> of{" "}
            <span className="font-mono text-ink">{total}</span> trips
          </>
        ) : (
          <>
            <span className="font-mono text-ink">{total}</span> trips, each one led by a
            guide you can name
          </>
        )}
      </p>

      <BrowseSearch
        q={filters.q}
        from={filters.from}
        to={filters.to}
        today={today}
        placeholder="Everest, momo, Pokhara, a guide's name…"
        dateLabel="Departing between"
        hidden={{ kind, party: filters.party ? String(filters.party) : "" }}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const params = new URLSearchParams();
          if (c.kind) params.set("kind", c.kind);
          if (filters.q) params.set("q", filters.q);
          if (filters.from) params.set("from", filters.from);
          if (filters.to) params.set("to", filters.to);
          if (filters.party) params.set("party", String(filters.party));
          const qs = params.toString();
          return (
            <Chip
              key={c.kind}
              to={qs ? `/experiences?${qs}` : "/experiences"}
              glyph={c.kind ? KIND_GLYPH[c.kind] : undefined}
              selected={kind === c.kind}
            >
              {c.label}
            </Chip>
          );
        })}
      </div>

      {/* One panel for every filter that is not a pill. The pills stay because
          "show me the day hikes" should be one tap, not a dialog. */}
      <div className="mt-3">
        <FilterSheet
          groups={groups}
          params={params}
          resultCount={offerings.length}
          action="/experiences"
          keep={["q", "from", "to"]}
        />
      </div>

      {(filters.from || !!filters.party) && (
        <p className="mt-2 text-caption text-muted">
          {filters.party
            ? `Showing trips that take a party of ${filters.party}`
            : "Showing trips"}
          {filters.from
            ? `, whose guide is free for the whole trip between ${fmtDateShort(filters.from)} and ${fmtDateShort(filters.to)}`
            : ""}
          .
        </p>
      )}

      {offerings.length === 0 ? (
        <div className="mt-10">
          <p className="font-display text-xl text-ink">Nothing matches all of that.</p>
          <p className="mt-1 max-w-[52ch] text-muted">
            A long trek needs the whole window free — try widening the dates, or
            drop them and message a guide about when they can go.
          </p>
          <Link
            to="/experiences"
            className="mt-3 inline-block rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
          >
            Show everything
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {offerings.map((o) => (
            <OfferingCard
              key={o.id}
              offering={o}
              rating={ratings[(o as any).guide_id]}
              photos={photos[o.id]}
            />
          ))}
        </div>
      )}

      <BookingAssurance className="mt-16" />
    </main>
  );
}
