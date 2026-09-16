import { Link } from "react-router";
import { Glyph } from "~/components/design/Chip";
import { assurances } from "~/lib/assurance";
import { cn } from "~/lib/cn";

/**
 * The reassurance row at the foot of a results page.
 *
 * It belongs on an EMPTY result as much as a full one — arguably more. Someone
 * who searched and found nothing is the visitor most likely to leave, and the
 * three sentences that would have made them book are the three they never
 * reached.
 *
 * Every claim comes from `~/lib/assurance`, which derives the two money ones
 * from the refund engine, and each links to the page that spells it out. A
 * reassurance you cannot click through to is a slogan.
 */
export function BookingAssurance({ className }: { className?: string }) {
  return (
    <section
      className={cn("border-t border-line pt-8", className)}
      aria-label="What you can count on"
    >
      <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
        {assurances().map((a) => (
          <li key={a.key}>
            <Link to={a.href} prefetch="intent" className="group flex gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-mist text-moss">
                <Glyph name={a.glyph} className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium leading-snug text-ink group-hover:text-moss">
                  {a.headline}
                </span>
                <span className="mt-1 block text-sm leading-snug text-muted">
                  {a.detail}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
