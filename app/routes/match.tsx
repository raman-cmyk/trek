import { Form, Link } from "react-router";
import type { Route } from "./+types/match";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { matchGuides } from "~/lib/match.server";
import { monthName, type MatchQuery, type Region } from "~/lib/match";
import { useMoney } from "~/lib/currency-context";
import { TierBadge } from "~/components/public/bits";
import { SmartImage } from "~/components/SmartImage";
import { cn } from "~/lib/cn";

const REGIONS: Region[] = ["Khumbu", "Annapurna", "Langtang", "Manaslu"];
const LANGUAGES = ["English", "German", "Spanish", "Hindi", "French"];
const BUDGETS = [
  { label: "Under $700", cents: 70000 },
  { label: "Under $1,000", cents: 100000 },
  { label: "Under $1,500", cents: 150000 },
  { label: "No limit", cents: 0 },
];

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Find your guide — matched to your trek, month and budget",
    description:
      "Answer five quick questions and we'll match you with verified Nepali guides who run your route, are free in your month, and fit your budget.",
    canonical: (data as any)?.canonical ?? "",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const url = new URL(request.url);
  const p = url.searchParams;

  const region = (p.get("region") || null) as Region | null;
  const month = p.get("month") ? Number(p.get("month")) : null;
  const budget = p.get("budget") ? Number(p.get("budget")) : null;
  const language = p.get("language") || null;
  const fitness = (p.get("fitness") || null) as MatchQuery["fitness"];
  const groupSize = Math.max(1, Math.min(12, Number(p.get("group") ?? 2)));
  const submitted = p.has("go");

  const q: MatchQuery = {
    region: REGIONS.includes(region as Region) ? region : null,
    month: month && month >= 1 && month <= 12 ? month : null,
    budgetUsdCents: budget && budget > 0 ? budget : null,
    language: language && language !== "English" ? language : null,
    fitness: ["easy", "moderate", "tough"].includes(fitness ?? "") ? fitness : null,
    groupSize,
  };

  let matches: Array<{ guide: any; reasons: string[]; bestOffering: any }> = [];
  if (submitted) {
    const client = createPublicClient(env);
    const { results, guides } = await matchGuides(client, q);
    matches = results.slice(0, 6).map((r) => ({
      guide: guides.get(r.guideId),
      reasons: r.reasons.slice(0, 4),
      bestOffering: r.bestOffering,
    }));
  }

  return {
    submitted,
    query: { ...q, groupSize, budget, language: language ?? "English" },
    matches,
    canonical: absoluteUrl(env.SITE_URL, "/match"),
  };
}

function Chip({ name, value, current, children }: {
  name: string; value: string; current: string | null; children: React.ReactNode;
}) {
  const active = current === value || (!current && value === "");
  return (
    <label
      className={cn(
        "cursor-pointer rounded-pill border px-3 py-1.5 text-sm",
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-line text-ink hover:bg-mist",
      )}
    >
      <input type="radio" name={name} value={value} defaultChecked={active} className="sr-only" />
      {children}
    </label>
  );
}

export default function Match({ loaderData }: Route.ComponentProps) {
  const { submitted, query, matches } = loaderData as any;
  const { m } = useMoney();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="label text-muted">Guide matcher</p>
      <h1 className="mt-2 font-display text-display-l text-ink">
        Five questions. Your guide.
      </h1>
      <p className="mt-3 max-w-[60ch] text-ink-soft">
        Tell us where, when and how you trek — we'll show you the verified guides
        who actually fit, and say exactly why.
      </p>

      <Form method="get" className="mt-8 space-y-6 rounded-card border border-border bg-card p-5">
        <input type="hidden" name="go" value="1" />
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Where do you want to trek?</legend>
          <div className="flex flex-wrap gap-2">
            <Chip name="region" value="" current={query.region}>Anywhere</Chip>
            {REGIONS.map((r) => (
              <Chip key={r} name="region" value={r} current={query.region}>{r}</Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Which month?</legend>
          <div className="flex flex-wrap gap-2">
            <Chip name="month" value="" current={query.month ? String(query.month) : null}>Flexible</Chip>
            {[3, 4, 5, 9, 10, 11, 12].map((m) => (
              <Chip key={m} name="month" value={String(m)} current={query.month ? String(query.month) : null}>
                {monthName(m).slice(0, 3)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Budget per person?</legend>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => (
              <Chip
                key={b.cents}
                name="budget"
                value={b.cents ? String(b.cents) : ""}
                current={query.budget ? String(query.budget) : null}
              >
                {b.label}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-6 sm:grid-cols-2">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Guide speaks…</legend>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <Chip key={l} name="language" value={l === "English" ? "" : l} current={query.language === "English" ? null : query.language}>
                  {l}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">How hard can it be?</legend>
            <div className="flex flex-wrap gap-2">
              <Chip name="fitness" value="" current={query.fitness}>Any</Chip>
              <Chip name="fitness" value="easy" current={query.fitness}>Take it easy</Chip>
              <Chip name="fitness" value="moderate" current={query.fitness}>Moderate</Chip>
              <Chip name="fitness" value="tough" current={query.fitness}>Bring it on</Chip>
            </div>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            Group of
            <select
              name="group"
              defaultValue={String(query.groupSize)}
              className="rounded-button border border-border px-2 py-1.5 font-mono"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button className="rounded-button bg-primary px-6 py-2.5 font-medium text-white hover:bg-primary-hover">
            Match me
          </button>
        </div>
      </Form>

      {submitted && (
        <section className="mt-10">
          <h2 className="font-display text-2xl text-ink">
            {matches.length > 0
              ? `${matches.length} guide${matches.length === 1 ? "" : "s"} fit`
              : "No exact fits"}
          </h2>
          {matches.length === 0 && (
            <p className="mt-2 text-ink-soft">
              Loosen a filter — or <Link to="/guides" className="text-primary">browse all guides</Link>.
            </p>
          )}
          <ul className="mt-4 space-y-4">
            {matches.map(({ guide: g, reasons, bestOffering }: any) => (
              <li key={g.user_id} className="rounded-card border border-border bg-card p-4">
                <div className="flex items-start gap-4">
                  <SmartImage
                    src={g.avatar_url ?? ""}
                    alt={g.full_name}
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/guides/${g.slug}`} className="font-medium text-ink hover:underline">
                        {g.full_name}
                      </Link>
                      <TierBadge tier={g.tier} />
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {reasons.map((r: string) => (
                        <li
                          key={r}
                          className="rounded-pill bg-mist px-2.5 py-1 text-xs text-ink"
                        >
                          {r}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {bestOffering && (
                        <Link
                          to={`/${bestOffering.kind === "trek" ? "treks" : "experiences"}/${bestOffering.slug}`}
                          className="rounded-button bg-primary px-3 py-1.5 text-sm font-medium text-white"
                        >
                          {bestOffering.title}
                          {bestOffering.fromUsdCents
                            ? ` — from ${m(bestOffering.fromUsdCents)}`
                            : ""}
                        </Link>
                      )}
                      <Link to={`/guides/${g.slug}`} className="text-sm text-primary">
                        Full profile →
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
