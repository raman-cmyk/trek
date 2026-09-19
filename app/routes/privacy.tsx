import type { Route } from "./+types/privacy";
import { absoluteUrl, pageMeta } from "~/lib/seo";
import { getEnv } from "~/lib/supabase.server";

export function meta({ loaderData: data }: Route.MetaArgs) {
  return pageMeta({
    title: "Privacy — Trek",
    description: "How Trek collects, uses, shares, protects, and deletes personal information.",
    canonical: data?.canonical ?? "",
  });
}

export function loader({ context }: Route.LoaderArgs) {
  return { canonical: absoluteUrl(getEnv(context).SITE_URL, "/privacy") };
}

export default function Privacy() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl text-ink">Privacy</h1>
      <p className="mt-3 text-sm text-ink-soft">Last updated 19 September 2026</p>
      <div className="mt-8 space-y-8 text-ink-soft">
        <Section title="What we collect">
          We collect the account and profile details you provide, enquiries, booking and payment
          references, messages and uploaded media, and the documents needed to arrange a trek.
          Payment-card details are handled by our payment provider rather than stored by Trek.
        </Section>
        <Section title="Why we use it">
          We use this information to match trekkers with guides, operate bookings and payments,
          arrange permits, verify guides and insurance, support safety on the trail, prevent abuse,
          and meet our legal and accounting obligations.
        </Section>
        <Section title="Who can see it">
          Public guide profiles, listings, approved journals, and public event details are visible to
          visitors. Booking messages are limited to their participants. Passport, insurance, and
          guide-verification documents are private and available only to the person who owns them and
          authorised operations staff. We share only what is needed with guides, payment and
          communications providers, permit authorities, and emergency services.
        </Section>
        <Section title="Photos and location data">
          Uploaded journal and message photos are processed to remove location and other hidden
          metadata before storage. Message attachments are private and require an authorised session
          each time they are opened.
        </Section>
        <Section title="Retention and deletion">
          Passport and insurance files are scheduled for deletion 90 days after a completed trek.
          We keep booking, payment, safety, and accounting records only as long as operational or legal
          obligations require. You may ask us to correct or delete your account; active bookings,
          payouts, contracts, fraud-prevention records, or legal duties can limit immediate deletion.
        </Section>
        <Section title="Your choices and contact">
          You can update profile information in your account and unsubscribe from optional email using
          the link in each message. For access, correction, deletion, or privacy questions, email
          privacy@guidesofnepal.com. We may need to verify your identity before acting on a request.
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
