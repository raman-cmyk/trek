import { Link } from "react-router";
import { REFUND_BANDS } from "~/lib/payment-policy";

/**
 * What you get for paying us, said at the moment of paying.
 *
 * Checkout had a price, a button and one line of refund copy. The pages we
 * are compared with close with a "book with confidence" block, and the reason
 * it works is that the last screen before a card is charged is where doubt
 * actually lives.
 *
 * Every claim here is one this platform can keep. Not "lowest price
 * guarantee", which we cannot honour; not "24/7 global support", which is a
 * team we do not have; not "unlimited rescheduling", which is not our policy.
 * A promise nobody can keep costs more than the space it fills.
 */
export function BookWithConfidence({
  guideFirstName,
  /** The last day of the full-refund band, when the trip is still outside it. */
  freeCancelUntil,
  /** Where the office reads its post. */
  opsEmail = "hello@guidesofnepal.com",
}: {
  guideFirstName: string;
  freeCancelUntil?: string | null;
  opsEmail?: string;
}) {
  return (
    <section className="mt-6 rounded-card border border-line bg-card p-4">
      <h2 className="font-display text-lg text-ink">Book with confidence</h2>

      <ul className="mt-3 space-y-3.5">
        <Row title="Your money is not your guide's yet">
          We hold it until the trip starts. Nothing reaches {guideFirstName} before
          you have set off, which is what makes a refund possible at all.
        </Row>

        <Row title="Cancel and get it back">
          {freeCancelUntil ? (
            <>
              Cancel before {freeCancelUntil} and you get {REFUND_BANDS[0].youGetBack} back.
              After that it tapers — the bands are on the trip page, in the words
              the policy means.
            </>
          ) : (
            <>
              This trip starts soon, so the full-refund window has passed. What
              comes back at each point is set out on the trip page — no small
              print, and no figure you have not already seen.
            </>
          )}{" "}
          If {guideFirstName} cancels, or we call it off for weather or safety, you
          get everything back.
        </Row>

        <Row title="A guide our office checked, not a listing">
          {guideFirstName} was verified by a person here before appearing on the
          site: identity, licence, and first aid. That is the whole reason this
          platform exists — you booked a named human, not an agency's rota.
        </Row>

        <Row title="Somebody answers">
          Message {guideFirstName} any time from{" "}
          <Link to="/messages" className="text-moss underline decoration-sage underline-offset-2">
            your messages
          </Link>{" "}
          — it is the same thread you have been using, and it stays open through
          the trip. For anything a guide cannot settle, the office reads{" "}
          <a
            href={`mailto:${opsEmail}`}
            className="text-moss underline decoration-sage underline-offset-2"
          >
            {opsEmail}
          </a>
          . We are in Kathmandu, so we are awake when your guide is.
        </Row>
      </ul>
    </section>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <Tick />
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{children}</p>
      </div>
    </li>
  );
}

function Tick() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="mt-0.5 shrink-0 text-moss"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}
