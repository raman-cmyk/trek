import { Link } from "react-router";
import type { Route } from "./+types/transparency";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { createPublicClient, getEnv } from "~/lib/supabase.server";
import { computeExperiencePricing, type PriceBreakdown } from "~/lib/experience-pricing";
import { useMoney } from "~/lib/currency-context";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Transparent pricing — every line, printed",
    description:
      "Trek shows every line of what you pay: the guide's fee (all of it goes to them), permits at cost, teahouse and logistics, our 10% fee, and 3% to The Fund. Every rupee, itemised.",
    canonical: (data as any)?.canonical ?? "",
  });
}

export async function loader({ context }: Route.LoaderArgs) {
  const env = getEnv(context);
  const client = createPublicClient(env);
  // Worked example from a real, live listing — the same numbers the booking
  // page and the homepage Split show. Never a made-up illustration.
  const { data: o } = await client
    .from("public_offerings")
    .select("slug, title, days, price_breakdown, guide_name")
    .eq("kind", "trek")
    .not("price_breakdown", "is", null)
    .order("days", { ascending: false })
    .limit(1)
    .maybeSingle();

  const bd = (o?.price_breakdown ?? null) as PriceBreakdown | null;
  const example = bd?.guide_fee_total_usd_cents
    ? { ...computeExperiencePricing(bd, 2), title: o!.title, slug: o!.slug, guide: o!.guide_name, days: o!.days }
    : null;

  return { example, canonical: absoluteUrl(env.SITE_URL, "/transparency") };
}

export default function Transparency({ loaderData }: Route.ComponentProps) {
  const { example } = loaderData as any;
  const { m } = useMoney();

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="label text-muted">Pricing</p>
      <h1 className="mt-2 font-display text-display-l text-ink">
        Every line, printed.
      </h1>
      <p className="mt-4 max-w-[62ch] text-body-l text-ink">
        Most agencies quote one number and keep the breakdown to themselves. We
        show every line of what you pay — and exactly which part is ours.
      </p>

      {/* The worked example, from a live listing */}
      {example && (
        <section className="mt-10 rounded-card border border-line bg-card p-6">
          <p className="text-sm text-ink-soft">
            A real listing, two trekkers — {example.title}, {example.days} days with{" "}
            {example.guide}:
          </p>
          <dl className="mt-4 space-y-1 text-sm">
            {example.lines.map((l: any) => (
              <div key={l.key} className="flex justify-between border-b border-line/60 py-1.5">
                <dt className={l.key === "trek" ? "font-medium text-ink" : "text-ink-soft"}>
                  {l.label}
                  {l.key === "trek" && " — this is ours"}
                  {l.key === "guide" && " — all of it goes to your guide"}
                </dt>
                <dd className="font-mono text-ink">{m(l.amountUsdCents)}</dd>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-medium">
              <dt>Per person</dt>
              <dd className="font-mono">{m(example.perPersonUsdCents)}</dd>
            </div>
          </dl>
          <Link
            to={`/treks/${example.slug}`}
            className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
          >
            See it live on the listing →
          </Link>
        </section>
      )}

      <div className="mt-10 space-y-6">
        <Item title="The guide's fee is the guide's">
          Your guide sets their own day rate. The guide-fee line is theirs in
          full — we don't take a commission out of it. On a group trek that fee
          is fixed for the trip and shared between you, so the per-person price
          drops as your group grows.
        </Item>
        <Item title="Permits, porters, teahouses — at cost">
          National park entries, conservation permits, TIMS cards, porter wages
          and teahouse/food/logistics are charged at what they cost. Every route
          page shows the live permit table. No markup hides in these lines.
        </Item>
        <Item title="Our fee: 10%, on top, visible">
          Trek charges a 10% fee on the package — printed as its own line on
          every price, on the listing and at checkout. That's how we pay for
          verification, permits paperwork, payments, support and the 24/7 ops
          line. It is the only money we make on your trek.
        </Item>
        <Item title="The Fund: 3%">
          A further 3% goes to The Fund — porter insurance and gear, guide
          first-aid training, and grants in the villages our treks walk through.
          It's printed on your bill and{" "}
          <Link to="/fund" className="text-primary hover:underline">
            accounted for publicly
          </Link>
          .
        </Item>
        <Item title="Rescue flights: 0% — ever">
          If you need a helicopter evacuation, we take nothing. Your safety is
          never our margin.
        </Item>
        <Item title="What changes the price">
          Group size (the guide fee splits), teahouse standard, and whether you
          take a porter. The booking page lets you move all three and watch the
          number change — that's the whole package, itemised.
        </Item>
      </div>

      <p className="mt-10 text-sm text-ink-soft">
        Guides can read the same maths from their side on{" "}
        <Link to="/hosts" className="text-primary hover:underline">the guide page</Link>.
      </p>
    </main>
  );
}

function Item({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border p-5">
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-2 text-ink-soft">{children}</p>
    </section>
  );
}
