import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { firstSentence, journalMonth, type PublicJournal } from "~/lib/journals";
import { cn } from "~/lib/cn";

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
        "group flex h-full overflow-hidden rounded-md border border-line bg-card",
        "transition-colors duration-instant ease-out-soft hover:border-sage",
        feature ? "flex-col sm:flex-row sm:items-stretch" : "flex-col",
      )}
    >
      <SmartImage
        src={j.cover_photo_url ?? ""}
        alt={j.title}
        width={feature ? 1000 : lead ? 900 : 450}
        height={feature ? 750 : lead ? 600 : 300}
        className={cn(
          feature
            ? "aspect-[16/10] w-full sm:aspect-[16/10] sm:w-[48%] sm:shrink-0"
            : lead
              ? "aspect-[3/2] w-full"
              : "aspect-[4/3] w-full",
        )}
      />
      <div
        className={cn(
          "flex flex-1 flex-col gap-1.5",
          feature ? "p-5 sm:p-7" : lead ? "p-5" : "p-3.5",
        )}
      >
        <p className="font-mono text-caption text-muted">{meta}</p>
        <h3
          className={cn(
            "font-display leading-snug text-ink group-hover:text-moss",
            lead ? "text-2xl sm:text-[1.75rem]" : "text-lg",
          )}
        >
          {j.title}
        </h3>
        {j.guide_note && (
          <p className={cn("text-ink-soft", lead ? "text-base" : "text-sm line-clamp-3")}>
            {firstSentence(j.guide_note, lead ? 190 : 120)}
          </p>
        )}
        {/* A div, not a p: SmartImage renders a div, and a div inside a p is
            invalid HTML that the parser un-nests — which breaks hydration for
            the whole page. */}
        {showGuide && (
          <div className="mt-auto flex items-center gap-2 pt-2 text-caption text-muted">
            <SmartImage
              src={j.guide_avatar_url ?? ""}
              alt=""
              width={28}
              height={28}
              className="h-6 w-6 shrink-0 rounded-full"
            />
            <span>
              led by <span className="font-medium text-ink">{j.guide_name}</span>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
