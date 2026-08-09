import type { Route } from "./+types/transparency";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Transparent pricing — what you pay and why",
    description:
      "We itemise every cost: guide fee, permits, and our fee. No hidden markup. Here's exactly how pricing works on Trek.",
    canonical: data?.canonical ?? "",
  });
}

export function loader({ context }: Route.LoaderArgs) {
  return { canonical: absoluteUrl(getEnv(context).SITE_URL, "/transparency") };
}

export default function Transparency() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-ink">Transparent pricing</h1>
      <p className="mt-4 text-lg text-ink-soft">
        Most agencies quote one number and keep the breakdown to themselves. We
        show you every line, because transparency is the whole point.
      </p>

      <div className="mt-8 space-y-6">
        <Item title="Guide fee">
          Your guide sets a fair day rate. For treks it’s the day rate × days ×
          party size; for experiences it’s a per-person price. This is the money
          that reaches the human leading you — 85% of it, directly.
        </Item>
        <Item title="Permits">
          National park entries, conservation permits and TIMS cards are charged
          at cost — what the government charges, no markup. Every route page
          shows the live permit table.
        </Item>
        <Item title="Our service fee">
          A flat 8% on the guide fee covers payments, support and the platform.
          On multi-day treks a $25 permit-handling fee covers the paperwork our
          partner agency files on your behalf.
        </Item>
        <Item title="What the guide earns">
          We take a 15% commission from the guide’s fee — it funds verification,
          customer protection and permit logistics. A guide earning a $360 fee
          takes home $306, and we tell them so, plainly, on their dashboard.
        </Item>
        <Item title="Rescue flights: 0% — ever">
          If you need a helicopter evacuation, we take nothing. Your safety is
          never our margin.
        </Item>
      </div>
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
