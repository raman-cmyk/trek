import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { firstSentence, journalMonth, type PublicJournal } from "~/lib/journals";
import { cn } from "~/lib/cn";
import { firstName } from "~/lib/names";

/**
 * A journal on the wall. Two sizes: `lead` is the dominant first card on a
 * guide's profile (Not-AI doc — one element must clearly win), `normal` is
 * everything after it.
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
  size?: "lead" | "normal";
  showGuide?: boolean;
}) {
  const lead = size === "lead";
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
        "group flex h-full flex-col overflow-hidden rounded-md border border-line bg-card",
        "transition-colors duration-instant ease-out-soft hover:border-sage",
      )}
    >
      <SmartImage
        src={j.cover_photo_url ?? ""}
        alt={j.title}
        width={lead ? 900 : 450}
        height={lead ? 600 : 300}
        className={cn("w-full", lead ? "aspect-[3/2]" : "aspect-[4/3]")}
      />
      <div className={cn("flex flex-1 flex-col gap-1.5", lead ? "p-5" : "p-3.5")}>
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
              led by <span className="font-medium text-ink">{firstName(j.guide_name)}</span>
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}
