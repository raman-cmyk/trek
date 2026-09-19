import type { Route } from "./+types/terms";
import { absoluteUrl, pageMeta } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Terms — Trek",
    description: "The terms for using Trek and booking independent guides and experiences in Nepal.",
    canonical: data?.canonical ?? "",
  });
}

export function loader({ context }: Route.LoaderArgs) {
  return { canonical: absoluteUrl(getEnv(context).SITE_URL, "/terms") };
}

export default function Terms() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-ink">Terms</h1>
      <p className="mt-3 text-sm text-ink-soft">Last updated 19 September 2026</p>
      <div className="mt-8 space-y-8 text-ink-soft">
        <Section title="The marketplace">
          Trek helps trekkers find and book independent guides and experiences in Nepal. Guides are
          responsible for delivering the services shown in an accepted proposal or booking. Trek
          operates the marketplace, payment flow, verification, and support; it is not the guide.
        </Section>
        <Section title="Bookings and payments">
          A booking is held while its deposit is pending and becomes confirmed only when the required
          payment and documents are complete. The checkout page shows the exact price, deposit,
          instalment plan, cancellation date, and fees that apply to that booking. A later pricing
          change does not rewrite an existing booking.
        </Section>
        <Section title="Changes and cancellations">
          Changes require agreement through Trek. Refunds and cancellation charges are calculated from
          the policy displayed with the booking. A guide cancellation remains the guide's responsibility;
          Trek will support rebooking or refund handling as the booking policy provides.
        </Section>
        <Section title="Safety and traveller responsibilities">
          Mountain travel has inherent risks. Trekkers must provide accurate health and emergency
          information, follow lawful safety instructions, carry the required evacuation insurance, and
          provide valid permit and identity documents. Verification reduces risk but cannot remove it.
        </Section>
        <Section title="Acceptable use and content">
          Do not impersonate another person, evade payment, harass participants, upload unlawful or
          harmful material, or misuse private contact information. You keep ownership of content you
          submit and allow Trek to store and display it as needed to provide the service and, when you
          explicitly approve publication, to show it publicly.
        </Section>
        <Section title="Account action and contact">
          We may restrict or close accounts to protect users, comply with law, investigate abuse, or
          enforce these terms. Existing payment, refund, safety, and record-keeping obligations survive
          account closure. Questions may be sent to support@guidesofnepal.com.
        </Section>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      <p className="mt-2 leading-7">{children}</p>
    </section>
  );
}
