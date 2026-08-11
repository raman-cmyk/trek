import type { Route } from "./+types/trust";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";
import { TierBadge } from "~/components/public/bits";
import { TIERS } from "~/lib/tiers";

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

      {/* Porter-welfare pledge (v3 Phase 3) */}
      <section id="porters" className="mt-10 rounded-lg border border-line bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-2xl">🎒</span>
          <h2 className="font-display text-display-m text-ink">The porter-welfare pledge</h2>
        </div>
        <p className="mt-3 max-w-[68ch] text-ink">
          Porters carry the Himalaya on their backs — and are the least protected people on the
          trail. Guides wearing this badge have signed a pledge, and we check it on the ground:
        </p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            "Max 25 kg per porter, weighed at the trailhead",
            "Paid the fair local rate or above, in full, within 7 days",
            "Accident & helicopter-evacuation insurance, paid by the trip",
            "Proper gear above 3,000 m — boots, jacket, sunglasses, shelter",
            "Same food and shelter standard as the crew",
            "No porter left to descend alone if sick",
          ].map((c) => (
            <li key={c} className="flex items-start gap-2 text-sm text-ink">
              <span aria-hidden className="mt-0.5 text-moss">✓</span>
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[68ch] text-sm text-muted">
          Aligned with International Porter Protection Group (IPPG) guidelines. A confirmed
          violation removes the badge and the guide's tier is reviewed.
        </p>
      </section>
    </main>
  );
}
