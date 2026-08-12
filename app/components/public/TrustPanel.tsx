import { Link } from "react-router";
import { cn } from "~/lib/cn";

/**
 * A short list of things that are true, at the moment somebody is deciding.
 *
 * Trust content had one home — /trust — which is the page you read *after* you
 * have already decided to be reassured. The moments that actually need it are
 * the ones where a person is about to do something irreversible: pay a
 * stranger, send their dates, join a trip organised by someone they have never
 * met. None of those had a word of it.
 *
 * Rules this component enforces by shape:
 *
 *   · Facts, not adjectives. Every line is a thing that happens, with a date
 *     or a number where one exists. "Secure checkout" is not a fact.
 *   · Three to five lines. A wall of reassurance reads as protesting too much,
 *     which is the opposite of the point.
 *   · Never a negation — the site rule. "We earn nothing from a rescue
 *     flight", not "no commission on rescues".
 *   · A way to check. Each panel links to the page carrying the detail, so the
 *     claim is auditable rather than asserted.
 */

export interface TrustItem {
  /** The fact. Keep it one line at 360px. */
  label: React.ReactNode;
  /** Optional second line — the mechanism, or the date. */
  note?: React.ReactNode;
}

export function TrustPanel({
  title,
  items,
  href,
  hrefLabel,
  tone = "quiet",
  className,
}: {
  title: string;
  items: TrustItem[];
  href?: string;
  hrefLabel?: string;
  /** `quiet` for inside a form; `card` when it stands on its own. */
  tone?: "quiet" | "card";
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <section
      className={cn(
        tone === "card"
          ? "rounded-md border border-line bg-card p-4"
          : "rounded-md bg-mist p-4",
        className,
      )}
    >
      <h2 className="label text-muted">{title}</h2>
      <ul className="mt-2.5 space-y-2">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5">
            <Tick />
            <span className="min-w-0 text-[13px] leading-snug text-ink">
              {it.label}
              {it.note && <span className="mt-0.5 block text-muted">{it.note}</span>}
            </span>
          </li>
        ))}
      </ul>
      {href && (
        <Link
          to={href}
          className="mt-3 inline-block text-[13px] text-moss underline underline-offset-4 hover:text-pine"
        >
          {hrefLabel ?? "How this works"} →
        </Link>
      )}
    </section>
  );
}

/** Moss, thin, and the same mark everywhere a fact is confirmed. */
function Tick() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="mt-0.5 shrink-0 text-moss"
    >
      <path
        d="M3 8.5l3.2 3.2L13 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
