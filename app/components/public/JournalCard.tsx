import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { firstSentence, journalMonth, type PublicJournal } from "~/lib/journals";
import { cn } from "~/lib/cn";
import { Fallback } from "~/components/design/Fallback";

/**
 * A journal on the wall. Three sizes:
 *
 *   normal   the card in a grid.
 *   lead     the dominant first card on a guide's profile — one element has
 *            to clearly win.
 *   feature  a full-width horizontal band, photo beside the words. Used at the
 *            top of the index, where a column-spanning lead left a hole the
 *            height of itself beside whatever short card landed next to it.
 *
 * The hook is the first sentence of the guide's closing note, not a summary we
 * wrote: it is the only line on the card in a human voice, and it is what makes
 * the wall read as a body of work rather than a product grid.
 */
export function JournalCard({
  journal: j,
  size = "normal",
  showGuide = false,
}: {
  journal: PublicJournal;
  size?: "lead" | "normal" | "feature";
  showGuide?: boolean;
}) {
  const feature = size === "feature";
  const lead = size === "lead" || feature;
  const meta = [
    `${j.days} days`,
    journalMonth(j.start_date),
    j.route_name ?? j.route_region,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      to={`/journals/${j.slug}`}
      prefetch="intent"
      className={cn(
        "group relative flex h-full overflow-hidden rounded-photo bg-card shadow-card",
        "transition duration-quick ease-out-soft hover:-translate-y-0.5 hover:shadow-lift",
        feature ? "flex-col border border-line sm:flex-row sm:items-stretch" : "flex-col",
      )}
    >
      {/* The photograph is the card (docs/07, from the MOSS reference): the
          words sit on a dark panel at its foot. The feature band keeps the
          photo beside the words, where there is room for the guide's own
          first sentence at reading size. */}
      <div
        className={cn(
          "relative overflow-hidden bg-wheat",
          feature
            ? "aspect-[16/10] w-full sm:aspect-auto sm:w-[48%] sm:shrink-0"
            : lead
              ? "aspect-[3/2] w-full"
              : "aspect-[4/5] w-full",
        )}
      >
        {j.cover_photo_url ? (
          <SmartImage
            src={j.cover_photo_url}
            alt={j.title}
            width={feature ? 1000 : lead ? 900 : 600}
            height={feature ? 750 : lead ? 600 : 750}
            cover
            className="absolute inset-0 h-full w-full"
            imgClassName="transition duration-slow group-hover:scale-[1.03]"
          />
        ) : (
          <Fallback glyph="camera" />
        )}
        {!feature && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-ink/80 via-ink/30 to-transparent" />
        )}
        {!feature && (
          <div className={cn("absolute inset-x-0 bottom-0 flex flex-col gap-1 text-paper", lead ? "p-5" : "p-3.5")}>
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-paper/75">{meta}</p>
            <h3 className={cn("font-display leading-snug", lead ? "text-2xl sm:text-[1.75rem]" : "text-lg")}>
              {j.title}
            </h3>
            {lead && j.guide_note && (
              <p className="text-sm text-paper/85">{firstSentence(j.guide_note, 140)}</p>
            )}
            {showGuide && (
              <div className="mt-1 flex items-center gap-2 text-caption text-paper/85">
                <SmartImage src={j.guide_avatar_url ?? ""} alt="" width={28} height={28} className="h-6 w-6 shrink-0 rounded-full ring-1 ring-paper/60" />
                <span>
                  led by <span className="font-medium text-paper">{j.guide_name}</span>
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      {feature && (
        <div className="flex flex-1 flex-col gap-1.5 p-5 sm:p-7">
          <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{meta}</p>
          <h3 className="font-display text-2xl leading-snug text-ink group-hover:text-moss sm:text-[1.75rem]">
            {j.title}
          </h3>
          {j.guide_note && <p className="text-base text-ink-soft">{firstSentence(j.guide_note, 190)}</p>}
          {showGuide && (
            <div className="mt-auto flex items-center gap-2 pt-2 text-caption text-muted">
              <SmartImage src={j.guide_avatar_url ?? ""} alt="" width={28} height={28} className="h-6 w-6 shrink-0 rounded-full" />
              <span>
                led by <span className="font-medium text-ink">{j.guide_name}</span>
              </span>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
