import { Link } from "react-router";
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
          Travel insurance covering high-altitude trekking and helicopter
          evacuation is required on every trek — not just the high ones. Nepal
          won't issue your permits or TIMS card without it, and neither will we.
          Our one-screen{" "}
          <Link to="/insurance" className="text-primary hover:underline">
            policy checker
          </Link>{" "}
          tells you in 30 seconds whether yours qualifies. If you ever need that
          flight, we take 0% on it.
        </Item>
        <Item title="Permits and your blue TIMS card">
          Multi-day treks need national-park or conservation permits plus a TIMS
          card. Since 2026 the old green independent-trekker card is gone: cards
          are issued through a registered agency and checkpoints verify your
          guide's licence alongside them. We file the paperwork, and your blue
          card appears on your trip page as a downloadable PDF once your
          insurance is verified. Costs are printed at cost on every route page.
        </Item>
        <Item title="A real team, not a call centre">
          Our ops team is based in Kathmandu. They file your permits, watch the
          daily check-ins come in, and pick up the phone if anything goes wrong —
          in the same time zone as your trek, not eight hours behind it.
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
