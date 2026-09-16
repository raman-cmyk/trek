import { SmartImage } from "~/components/SmartImage";
import { langLabel } from "~/components/public/cards";
import { formatNpr } from "~/lib/guide-earnings";
import { cn } from "~/lib/cn";

/**
 * The card they are building, filling in as they type.
 *
 * A form asks somebody to describe themselves into a set of boxes and then
 * shows them nothing. This is the same shape as the cards on the homepage, so
 * an applicant can see the thing a trekker in Berlin will actually see — and
 * the empty state is a skeleton rather than blank, so the shape is legible
 * before a word is typed.
 *
 * The badge says PENDING VERIFICATION, never VERIFIED. This is the one card
 * on the site that has not been checked by anybody, and it should not spend
 * ten minutes pretending otherwise to the person filling it in.
 */
export function LiveGuideCard({
  name,
  district,
  hook,
  languages,
  nprPerDay,
  photoUrl,
  pendingLabel,
  placeholders,
  className,
}: {
  name: string;
  district: string;
  hook: string;
  languages: string[];
  nprPerDay: number | null;
  photoUrl?: string | null;
  pendingLabel: string;
  placeholders: { name: string; district: string; hook: string };
  className?: string;
}) {
  const skeleton = "text-muted/50";
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-photo border border-line bg-card shadow-card",
        className,
      )}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-mist">
        {photoUrl ? (
          <SmartImage
            src={photoUrl}
            alt={name || placeholders.name}
            width={480}
            height={600}
            cover
            className="h-full w-full animate-[fade-in_400ms_ease-out] object-cover"
          />
        ) : (
          // A silhouette, not an empty box: the card still reads as a card.
          <div className="grid h-full w-full place-items-center" aria-hidden="true">
            <svg viewBox="0 0 64 64" className="h-20 w-20 text-sage/50" fill="currentColor">
              <circle cx="32" cy="22" r="11" />
              <path d="M10 62c0-12 10-20 22-20s22 8 22 20z" />
            </svg>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-pill bg-paper/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-soft">
          {pendingLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className={cn("font-display text-xl leading-tight", name ? "text-ink" : skeleton)}>
          {name || placeholders.name}
        </p>
        <p className={cn("text-sm", district ? "text-muted" : skeleton)}>
          {district || placeholders.district}
        </p>
        <p
          className={cn(
            "mt-1.5 border-l-2 pl-2.5 font-display text-sm leading-snug transition-opacity duration-instant",
            hook ? "border-chartreuse text-ink" : cn("border-line", skeleton),
          )}
        >
          {hook || placeholders.hook}
        </p>
        <div className="mt-auto flex items-baseline justify-between gap-2 pt-3 text-sm">
          <span className="truncate text-muted">{langLabel(languages)}</span>
          {nprPerDay ? (
            <span className="shrink-0 text-muted">
              <span className="font-mono font-medium text-ink">{formatNpr(nprPerDay)}</span>
              /day
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
