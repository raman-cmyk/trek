import type { Route } from "./+types/safety";
import { pageMeta, absoluteUrl } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Trust & safety — how we verify guides and keep you safe",
    description:
      "Every guide is verified: licence, ID, references, first-aid. Daily check-ins on the trail, required evacuation insurance, and an ops team in Kathmandu.",
    canonical: data?.canonical ?? "",
  });
}

export function loader({ context }: Route.LoaderArgs) {
  return { canonical: absoluteUrl(getEnv(context).SITE_URL, "/safety") };
}

export default function Safety() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-ink">Trust &amp; safety</h1>
      <p className="mt-4 text-lg text-ink-soft">
        You’re booking a real human to take you into the mountains. Here’s how we
        make sure that human is who they say they are — and how we look after you
        on the trail.
      </p>

      <div className="mt-8 space-y-6">
        <Item title="Every guide is verified">
          Before a guide goes live we check their trekking licence, match it to
          government ID, verify their phone, call two references, and confirm a
          current wilderness first-aid certificate. Elite guides also clear a
          police check and altitude training. Each guide’s profile shows exactly
          what we checked, with dates.
        </Item>
        <Item title="Daily check-ins on the trail">
          On every multi-day trek your guide checks in daily. A missed check-in
          triggers our ops team in Kathmandu within 24 hours, and an escalation
          — including your emergency contact — at 48.
        </Item>
        <Item title="Insurance that covers evacuation">
          For treks above 4,000m we require travel insurance that covers
          helicopter evacuation. It’s not optional, because the mountains aren’t
          forgiving — and if you ever need that flight, we take 0% on it.
        </Item>
        <Item title="A real team, not a call centre">
          Our ops team is based in Kathmandu, files your permits, tracks your
          trek, and is reachable if anything goes wrong. The admin console behind
          this platform is, honestly, the real product.
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
