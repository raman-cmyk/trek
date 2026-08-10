import type { Route } from "./+types/trust";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";
import { TierBadge } from "~/components/public/bits";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return pageMeta({
    title: "How we verify guides — the trust ladder",
    description:
      "Every guide on Trek is a named, verified human. Here's exactly what each tier means, what we check, and when we re-check it.",
    canonical: d?.canonical ?? "",
  });
}

export function loader({ context }: Route.LoaderArgs) {
  return { canonical: absoluteUrl(getEnv(context).SITE_URL, "/trust") };
}

const TIERS = [
  {
    tier: 1,
    what: "Government licence, photo ID and a working phone — all checked and dated. The starting bar to appear on Trek at all.",
    checks: ["TAAN / NMA licence verified", "Photo ID matched to the licence", "Reachable phone number"],
  },
  {
    tier: 2,
    what: "Everything in Verified, plus references and completed treks on the platform with real reviews behind them.",
    checks: ["2+ professional references", "5+ completed Trek bookings", "Wilderness first-aid certificate on file"],
  },
  {
    tier: 3,
    what: "Our highest tier. A long track record, top ratings, and a safety record we've audited. Rare by design.",
    checks: ["50+ completed treks", "4.8+ average rating", "Zero unresolved safety incidents", "Annual re-verification"],
  },
] as const;

export default function Trust({ loaderData: d }: Route.ComponentProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="label text-muted">Trust &amp; verification</p>
      <h1 className="mt-2 font-display text-display-l text-ink">
        A tier you can look up is trust. One you can't is decoration.
      </h1>
      <p className="mt-4 max-w-[68ch] text-body-l text-ink">
        Every guide on Trek is a named human with a licence we've seen. Tiers
        tell you how much further we've checked — never a vague badge with
        nothing behind it.
      </p>

      <div className="mt-10 space-y-4">
        {TIERS.map((t) => (
          <section
            key={t.tier}
            className="rounded-lg border border-line bg-card p-6 shadow-card"
          >
            <div className="flex items-center gap-3">
              <TierBadge tier={t.tier} />
            </div>
            <p className="mt-3 max-w-[68ch] text-ink">{t.what}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {t.checks.map((c) => (
                <li key={c} className="flex items-start gap-2 text-sm text-ink">
                  <span aria-hidden className="mt-0.5 text-moss">
                    ✓
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-lg bg-mist p-6">
        <h2 className="font-display text-display-m text-ink">
          We re-check, we don't set and forget
        </h2>
        <p className="mt-2 max-w-[68ch] text-ink">
          Licences expire and records change. Verified guides are re-checked on
          licence renewal; Elite guides are re-verified every year. A guide who
          lapses drops a tier until it's sorted — visibly, on their profile.
        </p>
      </section>
    </main>
  );
}
