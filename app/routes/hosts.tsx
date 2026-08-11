import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/hosts";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";
import { FX_RATE_NPR, TREK_FEE_PCT } from "~/lib/config";
import { formatUsd } from "~/lib/pricing";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Guide on Trek — your name, your rate, your clients",
    description:
      "Trek puts your face on the product. Set your own day rate, keep your whole fee, get paid in NPR within 7 days, and build a review record that belongs to you.",
    canonical: (data as any)?.canonical ?? "",
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  return { canonical: absoluteUrl(getEnv(context).SITE_URL, "/hosts") };
}

const PROPS = [
  {
    title: "Your name on the trek",
    body: "Trekkers book Pemba. Your photo, your voice, your reviews — a reputation that compounds and belongs to you.",
  },
  {
    title: "You set the rate — and keep it",
    body: "Your day rate is yours to choose, yours to raise as your reviews grow, and yours in full. Trek's 10% is added on top and paid by the trekker, printed on their bill.",
  },
  {
    title: "Paid in NPR, within 7 days",
    body: "Payout lands in your eSewa, Khalti or bank account within 7 days of trek completion. In rupees. No waiting for \"the season to settle\".",
  },
  {
    title: "A backup, never a black mark",
    body: "Sick before a departure? The named backup guide steps in and your record stays clean. The trek never cancels — and neither does your reputation.",
  },
  {
    title: "The platform does the paperwork",
    body: "Permits, TIMS cards, contracts, deposits, insurance checks — handled. You do the one thing agencies can't: be the guide people came for.",
  },
  {
    title: "Standards that protect you too",
    body: "Porter-welfare rules, insurance requirements, and a strike system that removes bad actors — so \"Nepali guide\" means what it should.",
  },
];

export default function Hosts({ loaderData }: Route.ComponentProps) {
  const [dayRate, setDayRate] = useState(45);
  const [tripDays, setTripDays] = useState(12);
  const [trips, setTrips] = useState(6);

  const guideFeeUsdCents = dayRate * 100 * tripDays * trips;
  // v3: the guide's fee is theirs in full; Trek's fee is added on top of the
  // package and paid by the trekker.
  const keepUsdCents = guideFeeUsdCents;
  const keepNpr = Math.round((keepUsdCents / 100) * FX_RATE_NPR);

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <p className="label text-muted">For guides</p>
      <h1 className="mt-2 max-w-[20ch] font-display text-display-l text-ink">
        Your name. Your rate. Your clients.
      </h1>
      <p className="mt-4 max-w-[62ch] text-body-l text-ink">
        Agencies sell packages and rent your legs. Trek sells <em>you</em> — a verified,
        named guide with a licence we've checked and reviews no one can take away.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/apply"
          className="rounded-button bg-primary px-6 py-3 font-medium text-white hover:bg-primary-hover"
        >
          Apply to guide on Trek
        </Link>
        <Link
          to="/trust"
          className="rounded-button border border-border px-6 py-3 font-medium text-ink hover:bg-mist"
        >
          How verification works
        </Link>
      </div>

      <div className="mt-12 grid gap-4 sm:grid-cols-2">
        {PROPS.map((p) => (
          <section key={p.title} className="rounded-card border border-border bg-card p-5">
            <h2 className="font-display text-xl text-ink">{p.title}</h2>
            <p className="mt-2 text-sm text-ink-soft">{p.body}</p>
          </section>
        ))}
      </div>

      {/* Earnings calculator — the honest math, in rupees. */}
      <section className="mt-12 rounded-card border border-border bg-card p-6">
        <h2 className="font-display text-display-m text-ink">What would a season pay?</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Move the numbers. Your fee is yours — Trek adds {Math.round(TREK_FEE_PCT * 100)}% on
          top of the package, paid by the trekker, printed on their bill. We take
          nothing out of your rate.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {[
            { label: "Your day rate (USD)", value: dayRate, set: setDayRate, min: 25, max: 90, step: 5, suffix: `$${dayRate}` },
            { label: "Days per trek", value: tripDays, set: setTripDays, min: 3, max: 18, step: 1, suffix: `${tripDays}d` },
            { label: "Treks per season", value: trips, set: setTrips, min: 2, max: 12, step: 1, suffix: `${trips}` },
          ].map((s) => (
            <label key={s.label} className="block text-sm text-ink">
              <span className="flex justify-between">
                {s.label}
                <span className="font-mono text-ink">{s.suffix}</span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={s.step}
                value={s.value}
                onChange={(e) => s.set(Number(e.target.value))}
                className="mt-2 w-full accent-[var(--color-moss)]"
              />
            </label>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border pt-4">
          <div>
            <p className="text-xs text-ink-soft">You keep (season)</p>
            <p className="font-mono text-3xl text-ink">
              रू {keepNpr.toLocaleString("en-IN")}
            </p>
          </div>
          <p className="font-mono text-sm text-ink-soft">
            ≈ {formatUsd(keepUsdCents)} · your full guide fee, no deductions
          </p>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          Group treks pay the same guide fee regardless of group size — bigger groups don't
          cut your rate. Porters, permits and logistics are charged to the trekker separately.
        </p>
      </section>

      {/* The path up */}
      <section className="mt-12">
        <h2 className="font-display text-display-m text-ink">The path up</h2>
        <ol className="mt-4 space-y-3">
          {[
            ["Apply", "Licence number, districts, languages, day rate. Ten minutes on a phone."],
            ["Verify", "We check your licence, ID and references — then your profile goes live with dated receipts trekkers can see."],
            ["Guide", "Enquiries land on your phone. Two taps to accept. The calendar, contracts and payments are handled."],
            ["Climb the tiers", "Reviews move you from Verified to Trusted to Elite — higher placement, higher rates, first pick of the Fund's training budget."],
          ].map(([t, b], i) => (
            <li key={t} className="flex gap-4 rounded-card border border-border bg-card p-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-moss font-mono text-sm text-white">
                {i + 1}
              </span>
              <div>
                <p className="font-medium text-ink">{t}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{b}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-6">
          <Link
            to="/apply"
            className="inline-block rounded-button bg-primary px-6 py-3 font-medium text-white hover:bg-primary-hover"
          >
            Start your application
          </Link>
        </div>
      </section>
    </main>
  );
}
