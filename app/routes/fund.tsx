import { Link, data } from "react-router";
import type { Route } from "./+types/fund";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createAdminClient, getEnv } from "~/lib/supabase.server";
import { partyAmounts, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "The Fund — 3% of every trek, spent on the trail",
    description:
      "Every Trek booking carries a visible 3% line called The Fund. Here's exactly what it has collected and where it goes: porter insurance, guide first-aid training, and trail communities.",
    canonical: (data as any)?.canonical ?? "",
  });
}

// Public, slow-moving number — cache at the edge (the loader also sets this,
// but document responses need the route-level headers export).
export function headers() {
  return { "Cache-Control": "public, max-age=900" };
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  // One public number, from the SNAPSHOT stored on each booking — a guide
  // re-pricing their trek must not rewrite history on a transparency page
  // (audit R5). Cancelled bookings don't count. Cached for 15 minutes.
  const admin = createAdminClient(env);
  const { data: rows } = await admin
    .from("bookings")
    .select("fund_usd_cents, party_size, status, offering:offerings(price_breakdown)")
    .not("deposit_paid_at", "is", null)
    .not("status", "like", "cancelled%");

  let collected = 0;
  let trips = 0;
  for (const b of rows ?? []) {
    // Snapshot first; fall back to the live breakdown for pre-0026 bookings.
    let fund = (b as any).fund_usd_cents ?? 0;
    if (!fund) {
      const bd = ((b as any).offering?.price_breakdown ?? null) as PriceBreakdown | null;
      if (!bd?.guide_fee_total_usd_cents) continue;
      fund = partyAmounts(bd, b.party_size).fundUsdCents;
    }
    collected += fund;
    trips += 1;
  }

  return data(
    { collected, trips, canonical: absoluteUrl(env.SITE_URL, "/fund") },
    { headers: { "Cache-Control": "public, max-age=900" } },
  );
}

const ALLOCATION = [
  {
    share: "40%",
    title: "Porter insurance & gear",
    body: "Accident and helicopter-evacuation cover for porters on Trek trips, plus a gear library (boots, jackets, sunglasses) for work above 3,000m — the practical half of the porter-welfare pledge.",
  },
  {
    share: "35%",
    title: "Guide training",
    body: "Wilderness first-aid certification and renewals for guides on the platform, prioritising Tier 1 guides working toward Trusted. A better-trained guide is the whole product.",
  },
  {
    share: "25%",
    title: "Trail communities",
    body: "Small grants where our treks walk: school supplies in Langtang's rebuilt villages, trail maintenance in the Khumbu, decided with the guides who live there — not from Kathmandu.",
  },
];

export default function Fund({ loaderData }: Route.ComponentProps) {
  const { collected, trips } = loaderData as any;
  const { m } = useMoney();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="label text-muted">The Fund</p>
      <h1 className="mt-2 font-display text-display-l text-ink">
        3% of every trek, spent on the trail.
      </h1>
      <p className="mt-4 max-w-[62ch] text-body-l text-ink">
        Every price breakdown on Trek shows a line called <strong>The Fund</strong> — 3% of the
        package, printed in the open, never hidden in a margin. This page is where it goes.
      </p>

      {/* Live counter — real bookings, real cents. */}
      <div className="mt-8 rounded-card border border-border bg-card p-6">
        <p className="text-sm text-ink-soft">
          {trips > 0
            ? `Collected so far, from ${trips} paid booking${trips === 1 ? "" : "s"}`
            : "Collected so far"}
        </p>
        <p className="mt-1 font-mono text-4xl text-ink">{m(collected)}</p>
        {trips === 0 && (
          <p className="mt-1 text-sm text-ink-soft">
            The counter starts with the first booking — and every cent is printed here.
          </p>
        )}
        <p className="mt-2 text-xs text-ink-soft">
          Computed live from paid bookings — the same 3% line you see at checkout, added up.
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {ALLOCATION.map((a) => (
          <section key={a.title} className="rounded-card border border-border bg-card p-5">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-2xl text-moss">{a.share}</span>
              <h2 className="font-display text-xl text-ink">{a.title}</h2>
            </div>
            <p className="mt-2 max-w-[62ch] text-sm text-ink-soft">{a.body}</p>
          </section>
        ))}
      </div>

      <section className="mt-10 rounded-card bg-mist p-6">
        <h2 className="font-display text-display-m text-ink">Who decides?</h2>
        <p className="mt-2 max-w-[62ch] text-ink">
          A committee of three platform guides — rotating yearly, currently drawn from our
          Elite tier — plus one Trek staff member. Disbursements are published here as they
          happen, with amounts. No disbursement, no line item, no exceptions.
        </p>
        <p className="mt-3 text-sm text-ink-soft">
          First disbursement window opens once the fund crosses $2,500.
        </p>
      </section>

      <p className="mt-8 text-sm text-ink-soft">
        See the 3% on any trip — every price on{" "}
        <Link to="/experiences" className="text-primary hover:underline">the experiences page</Link>{" "}
        breaks it out, or read about{" "}
        <Link to="/transparency" className="text-primary hover:underline">how our pricing works</Link>.
      </p>
    </main>
  );
}
