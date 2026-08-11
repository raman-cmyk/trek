import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/journals._index";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { JournalCard } from "~/components/public/JournalCard";
import { JOURNAL_COLS, type PublicJournal } from "~/lib/journals";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Trek stories — every trek, as it actually happened",
    description:
      "Blog-style albums from real treks in Nepal, written by the guides who led them. Photos from the trail, the weather that day, and the bad days too.",
    canonical: (data as any)?.canonical ?? "",
  });
}

export function headers() {
  return { "Cache-Control": "public, max-age=300" };
}

const SEASONS: Record<string, number[]> = {
  Spring: [3, 4, 5],
  Monsoon: [6, 7, 8],
  Autumn: [9, 10, 11],
  Winter: [12, 1, 2],
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  const p = new URL(request.url).searchParams;
  const region = p.get("region") ?? "";
  const route = p.get("route") ?? "";
  const guide = p.get("guide") ?? "";
  const season = p.get("season") ?? "";
  const tag = p.get("tag") ?? "";

  let q = client
    .from("public_journals")
    .select(JOURNAL_COLS)
    .order("start_date", { ascending: false });
  if (region) q = q.eq("route_region", region);
  if (route) q = q.eq("route_slug", route);
  if (guide) q = q.eq("guide_slug", guide);

  let journals = ((await q).data ?? []) as PublicJournal[];

  // Tags live in their own table so one journal can carry several. Filtering
  // by one narrows the set; the rest are still shown on each card.
  const { data: allTags } = await client
    .from("public_journal_tags")
    .select("journal_id, kind, value");
  const tagsByJournal = new Map<string, { kind: any; value: string }[]>();
  for (const t of allTags ?? []) {
    const list = tagsByJournal.get(t.journal_id) ?? [];
    list.push({ kind: t.kind, value: t.value });
    tagsByJournal.set(t.journal_id, list);
  }
  if (tag) {
    journals = journals.filter((j) =>
      (tagsByJournal.get(j.id) ?? []).some((t) => t.value === tag),
    );
  }

  // Season is a month-set, not a column — filter in JS rather than teaching
  // the view about hemispheres.
  const months = SEASONS[season];
  if (months) {
    journals = journals.filter((j) =>
      months.includes(Number(j.start_date.slice(5, 7))),
    );
  }

  const { data: all } = await client
    .from("public_journals")
    .select("route_region, route_slug, route_name, guide_slug, guide_name, start_date");
  const regions = [...new Set((all ?? []).map((j) => j.route_region).filter(Boolean))].sort();
  const routes = [
    ...new Map(
      (all ?? [])
        .filter((j) => j.route_slug)
        .map((j) => [j.route_slug, { slug: j.route_slug, name: j.route_name }]),
    ).values(),
  ].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const seasonCounts: Record<string, number> = {};
  for (const [name, months] of Object.entries(SEASONS)) {
    seasonCounts[name] = (all ?? []).filter((j: any) =>
      months.includes(Number(String(j.start_date ?? "").slice(5, 7))),
    ).length;
  }

  const tagCounts = new Map<string, number>();
  for (const list of tagsByJournal.values()) {
    for (const t of list) tagCounts.set(t.value, (tagCounts.get(t.value) ?? 0) + 1);
  }

  return {
    journals: journals.map((j) => ({ ...j, tags: tagsByJournal.get(j.id) ?? [] })),
    total: (all ?? []).length,
    facets: { regions, routes },
    seasonCounts,
    filters: { region, route, guide, season, tag },
    tags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([value, count]) => ({ value, count })),
    guideName:
      guide && (all ?? []).find((j) => j.guide_slug === guide)?.guide_name,
    canonical: absoluteUrl(env.SITE_URL, "/journals"),
  };
}

export default function Journals({ loaderData }: Route.ComponentProps) {
  const { journals, total, facets, filters, guideName, tags, seasonCounts } =
    loaderData as any;
  const narrowed = !!(
    filters.region || filters.route || filters.guide || filters.season || filters.tag
  );
  // Anything narrowed from the hidden row keeps that row open, or the active
  // filter would have no visible control.
  const more = [...facets.routes, ...tags];
  const [showMore, setMore] = useState(!!(filters.route || filters.tag));

  const chip = (label: string, params: Record<string, string>, active: boolean) => {
    const sp = new URLSearchParams({ ...filters, ...params });
    for (const [k, v] of [...sp.entries()]) if (!v) sp.delete(k);
    const qs = sp.toString();
    return (
      <Link
        key={label + JSON.stringify(params)}
        to={qs ? `/journals?${qs}` : "/journals"}
        prefetch="intent"
        className={
          "rounded-pill px-3 py-1.5 text-sm transition-colors " +
          (active
            ? "bg-pine text-paper"
            : "border border-line bg-card text-ink hover:border-sage")
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <p className="label text-muted">Trek stories</p>
      <h1 className="mt-2 max-w-[20ch] font-display text-4xl leading-[1.05] text-ink sm:text-5xl">
        <span className="wt-heavy">Every trek, as it actually happened.</span>
      </h1>
      <p className="mt-4 max-w-[58ch] text-body-l text-ink">
        Not brochures. Each one is a completed trek, written by the guide who led
        it — the teahouses, the weather, the day it went wrong, and the photos
        off his phone.
      </p>

      {/* One row of filters, and the rest behind a toggle. A tag that matches
          a single journal is not a filter, it is a label — showing twelve of
          them above four cards buries the writing under its own index. */}
      <div className="mt-7 space-y-2">
        <div className="flex flex-wrap gap-2">
          {chip("All", { region: "", route: "", guide: "", season: "", tag: "" }, !narrowed)}
          {facets.regions.map((r: string) =>
            chip(r, { region: r, route: "" }, filters.region === r),
          )}
          {Object.keys(SEASONS)
            .filter((s) => seasonCounts[s] > 0)
            .map((s) => chip(s, { season: s }, filters.season === s))}
          {more.length > 0 && (
            <button
              type="button"
              onClick={() => setMore((v) => !v)}
              aria-expanded={showMore}
              className="rounded-pill px-3 py-1.5 text-sm text-moss hover:underline"
            >
              {showMore ? "Fewer filters" : `More filters (${more.length})`}
            </button>
          )}
        </div>
        {showMore && (
          <div className="flex flex-wrap gap-2 pt-1">
            {facets.routes.map((r: any) =>
              chip(r.name, { route: r.slug, region: "" }, filters.route === r.slug),
            )}
            {tags.map((t: any) =>
              chip(t.value, { tag: t.value }, filters.tag === t.value),
            )}
          </div>
        )}
      </div>

      {guideName && (
        <p className="mt-4 text-sm text-muted">
          Showing only {guideName}'s journals ·{" "}
          <Link to="/journals" className="text-moss underline underline-offset-4">
            everyone's
          </Link>
        </p>
      )}

      <p className="mt-6 text-sm text-muted">
        {narrowed ? (
          <>
            <span className="font-mono text-ink">{journals.length}</span> of{" "}
            <span className="font-mono text-ink">{total}</span> journals
          </>
        ) : (
          <>
            <span className="font-mono text-ink">{total}</span> journals, and one more
            after every trek
          </>
        )}
      </p>

      {journals.length === 0 ? (
        <div className="mt-10">
          <p className="font-display text-xl text-ink">
            {total === 0
              ? "The first journals are being written."
              : "No journals match that yet."}
          </p>
          <p className="mt-1 max-w-[54ch] text-muted">
            {total === 0
              ? "Every trek booked on Trek ends with one — photos, days and the guide's own account. They start appearing as this season's treks come home."
              : "Try a wider region, or another season."}
          </p>
          <Link
            to="/guides"
            className="mt-3 inline-block rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
          >
            Meet the guides →
          </Link>
        </div>
      ) : (
        <>
          {/* The lead runs the full width as a horizontal feature rather than
              spanning two of three columns. Spanning left a hole the height of
              the lead beside a short card, and an empty third column on the
              row below — the emptiest possible arrangement of four journals. */}
          {!narrowed && journals.length > 0 && (
            <div className="mt-6">
              <JournalCard journal={journals[0]} size="feature" showGuide />
            </div>
          )}
          <div className="mt-5 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(narrowed ? journals : journals.slice(1)).map((j: PublicJournal) => (
              <JournalCard key={j.id} journal={j} showGuide />
            ))}
          </div>
        </>
      )}
    </main>
  );
}
