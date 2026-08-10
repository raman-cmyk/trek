import { useState } from "react";
import type { Route } from "./+types/_dev.primitives";
import { Button } from "~/components/Button";
import { Sheet } from "~/components/Sheet";
import { SmartImage } from "~/components/SmartImage";
import {
  CardGridSkeleton,
  EnquiryCardSkeleton,
  GuideCardSkeleton,
  OfferingCardSkeleton,
  ReviewSkeleton,
  TripCardSkeleton,
} from "~/components/skeletons";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Primitives — dev scratch" },
    { name: "robots", content: "noindex" },
  ];
}

// A self-contained demo image (data URI) so the blur-up cross-fade works with
// no network — the real app stores photos in Supabase Storage.
const DEMO_IMG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='800'>
       <defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>
         <stop offset='0' stop-color='#1B3B2A'/><stop offset='0.6' stop-color='#3E6B4A'/>
         <stop offset='1' stop-color='#DFF08A'/></linearGradient></defs>
       <rect width='600' height='800' fill='url(#g)'/>
       <polygon points='0,800 200,420 340,560 480,320 600,520 600,800' fill='#FBF9F3' opacity='0.85'/>
     </svg>`,
  );

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-border py-8">
      <h2 className="font-display text-2xl text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function Primitives() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  function runSubmit() {
    setLoading(true);
    setSuccess(false);
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 900);
    }, 1400);
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-ink-soft">
          Dev scratch · M0 foundation
        </p>
        <h1 className="font-display text-4xl text-ink">Motion & feel primitives</h1>
        <p className="text-ink-soft">
          Everything here honors <code>prefers-reduced-motion</code>. Turn it on
          in your OS to see shimmer and transforms collapse to fades.
        </p>
      </header>

      <Section title="Buttons — press / hover / loading / disabled">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Request to book</Button>
          <Button variant="secondary">Message Pemba</Button>
          <Button variant="ghost">See all guides</Button>
          <Button variant="danger">Cancel booking</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            loading={loading}
            success={success}
            loadingText="Sending…"
            onClick={runSubmit}
          >
            Pay $360 deposit
          </Button>
          <span className="text-sm text-ink-soft">
            Tap to see the fixed-width spinner → checkmark moment.
          </span>
        </div>
      </Section>

      <Section title="Sheet — bottom sheet (mobile) / modal (desktop)">
        <Button variant="secondary" onClick={() => setSheetOpen(true)}>
          Open sheet
        </Button>
        <p className="text-sm text-ink-soft">
          On a narrow viewport it slides up and drags to dismiss; on desktop it
          scales in as a centered modal (Esc or backdrop to close).
        </p>
        <Sheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          title="What we checked"
        >
          <ul className="space-y-3 text-ink">
            {[
              "Trekking licence — verified 12 Feb 2026",
              "Government ID matches licence",
              "Phone number verified",
              "Two reference calls completed",
              "Wilderness first-aid certificate current",
            ].map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="text-accent">✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <Button className="w-full" onClick={() => setSheetOpen(false)}>
              Got it
            </Button>
          </div>
        </Sheet>
      </Section>

      <Section title="SmartImage — blur-up from average colour">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {["#1B3B2A", "#3E6B4A", "#DFF08A", "#6B7A6E"].map((c) => (
            <SmartImage
              key={c}
              src={DEMO_IMG}
              alt="Demo trail"
              width={600}
              height={800}
              avgColor={c}
              className="rounded-card"
            />
          ))}
        </div>
      </Section>

      <Section title="Skeletons — dimension-matched, zero layout shift">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <GuideCardSkeleton />
          <OfferingCardSkeleton />
          <TripCardSkeleton />
          <EnquiryCardSkeleton />
        </div>
        <div className="max-w-md space-y-4">
          <ReviewSkeleton />
        </div>
      </Section>

      <Section title="Grid loader — staggered entrance wave (§3.3)">
        <CardGridSkeleton count={8} variant="offering" />
      </Section>
    </main>
  );
}
