import { Link } from "react-router";
import type { Route } from "./+types/experiences";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { OfferingCard, type PublicOffering } from "~/components/public/cards";
import { BrowseSearch } from "~/components/public/BrowseSearch";
import { escapeLike, openRunsByGuide, parseRange } from "~/lib/browse.server";
import { fmtDateShort } from "~/lib/format";

const CATEGORIES = [
  { kind: "", label: "All" },
  { kind: "trek", label: "Treks" },
  { kind: "day_hike", label: "Day hikes" },
  { kind: "food_culture", label: "Food & culture" },
  { kind: "adventure", label: "Adventure" },
  { kind: "city", label: "City" },
] as const;

const OFFERING_COLS =
  "id, slug, kind, route_id, title, summary, days, price_usd_cents, price_breakdown, max_party, min_party, cover_photo_url, guide_id, guide_slug, guide_name, guide_avatar_url, guide_tier, guide_day_rate_usd_cents";

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

  const { count: totalCount } = await client
    .from("public_offerings")
    .select("id", { count: "exact", head: true });

  return {
    offerings: offerings as PublicOffering[],
    total: totalCount ?? offerings.length,
    kind,
    filters: { q, from: range?.from ?? "", to: range?.to ?? "", party },
    today,
    canonical: absoluteUrl(env.SITE_URL, "/experiences"),
  };
}

export default function Experiences({ loaderData }: Route.ComponentProps) {
  const { offerings, total, kind, filters, today } = loaderData;
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
            <Link
              key={c.kind}
              to={qs ? `/experiences?${qs}` : "/experiences"}
              prefetch="intent"
              className={
                "rounded-pill px-3 py-1.5 text-sm transition-colors " +
                (kind === c.kind
                  ? "bg-pine text-paper"
                  : "border border-line bg-card text-ink hover:border-sage")
              }
            >
              {c.label}
            </Link>
          );
        })}
        {narrowed && (
          <Link
            to="/experiences"
            className="self-center px-2 py-1.5 text-sm text-moss underline underline-offset-4"
          >
            Clear
          </Link>
        )}
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
            <OfferingCard key={o.id} offering={o} />
          ))}
        </div>
      )}
    </main>
  );
}
