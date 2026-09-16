import { SmartImage } from "~/components/SmartImage";
import { PlayGlyph } from "~/components/public/Lightbox";
import { isVideo, type JournalPhoto } from "~/lib/journals";
import { cn } from "~/lib/cn";

/**
 * A day's frames, as one calm block.
 *
 * The old version rotated five different shapes down the page — full-bleed,
 * two-up, three-up, a portrait with text wrapped around it, a panorama — on
 * the theory that a repeating grid reads as machine-made. It read as noise
 * instead: every block a different silhouette, nothing to rest on, and a
 * portrait float that left half a row empty whenever the text ran short.
 *
 * So: one predictable arrangement per count, chosen so the block always fills
 * its width and never orphans a frame.
 *
 *   1  → one wide frame
 *   2  → side by side
 *   3  → one tall, two stacked beside it
 *   4  → an even two-by-two
 *   5+ → two-by-two, and the last tile counts what is behind it
 *
 * `feature` is the one dial on top of that, and it changes depth rather than
 * arrangement: the days the trek turns on get frames you can see into. Which
 * days those are is decided in `journal-reading`, from the altitudes.
 *
 * Everything opens the viewer, so the grid is a way in rather than the whole
 * album. Beyond four, the count is honest about how much more there is.
 */
export function MediaGrid({
  media,
  alt,
  onOpen,
  feature = false,
  className,
}: {
  media: JournalPhoto[];
  alt: string;
  /** Index within this block; the page maps it to the journal-wide gallery. */
  onOpen: (indexInBlock: number) => void;
  /**
   * This day's pictures carry the chapter: taller frames, and on a wide
   * screen a block that reaches past the measure of the prose. Used for the
   * hard day, the highest day, and the day a chapter opens — never on a
   * whim, or the emphasis means nothing.
   */
  feature?: boolean;
  className?: string;
}) {
  const n = media.length;
  if (n === 0) return null;

  // One gap everywhere. Two frames 8px apart and four frames 12px apart read
  // as two different components.
  const box = cn("mt-6 grid gap-3", feature && "xl:-mx-8", className);

  if (n === 1) {
    return (
      <div className={cn("mt-6", feature && "xl:-mx-8", className)}>
        <Frame
          media={media[0]}
          alt={alt}
          onOpen={() => onOpen(0)}
          ratio={feature ? "feature" : "wide"}
          priority
        />
      </div>
    );
  }

  if (n === 2) {
    return (
      <div className={cn(box, "grid-cols-2")}>
        {media.map((m, i) => (
          <Frame key={m.url + i} media={m} alt={alt} onOpen={() => onOpen(i)} ratio="pair" />
        ))}
      </div>
    );
  }

  if (n === 3) {
    return (
      <div className={cn(box, "grid-cols-2")}>
        <Frame media={media[0]} alt={alt} onOpen={() => onOpen(0)} ratio="tall" />
        <div className="grid grid-rows-2 gap-3">
          <Frame media={media[1]} alt={alt} onOpen={() => onOpen(1)} ratio="fill" />
          <Frame media={media[2]} alt={alt} onOpen={() => onOpen(2)} ratio="fill" />
        </div>
      </div>
    );
  }

  const shown = media.slice(0, 4);
  const hidden = n - 4;
  return (
    <div className={cn(box, "grid-cols-2")}>
      {shown.map((m, i) => (
        <Frame
          key={m.url + i}
          media={m}
          alt={alt}
          onOpen={() => onOpen(i)}
          ratio="square"
          more={i === 3 && hidden > 0 ? hidden : undefined}
        />
      ))}
    </div>
  );
}

const RATIO = {
  /** A day's single photograph. */
  wide: "aspect-[16/10]",
  /** The day that carries the chapter — deeper, and wider than the prose. */
  feature: "aspect-[4/3] sm:aspect-[3/2]",
  /**
   * Two frames side by side. At 4/3 a pair came out 250px deep in a reading
   * column and you could not see what was in them; 4/5 gives each one back
   * enough height to be a photograph rather than a thumbnail.
   */
  pair: "aspect-[3/4] sm:aspect-[4/5]",
  square: "aspect-[4/3]",
  tall: "aspect-[3/4] sm:aspect-[4/5]",
  fill: "h-full",
} as const;

function Frame({
  media,
  alt,
  onOpen,
  ratio,
  more,
  priority,
}: {
  media: JournalPhoto;
  alt: string;
  onOpen: () => void;
  ratio: keyof typeof RATIO;
  /** "+3" badge on the last visible tile. */
  more?: number;
  priority?: boolean;
}) {
  const video = isVideo(media);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        more
          ? `Open the gallery — ${more} more`
          : video
            ? `Play video: ${media.caption ?? alt}`
            : `Open photo: ${media.alt ?? alt}`
      }
      className={cn(
        "group relative block w-full overflow-hidden rounded-sm bg-mist",
        RATIO[ratio],
      )}
    >
      <SmartImage
        src={video ? (media.poster ?? "") : media.url}
        alt={media.alt ?? alt}
        width={1200}
        height={900}
        cover
        eager={priority}
        className="h-full w-full transition-transform duration-slow ease-out-soft group-hover:scale-[1.02]"
      />
      {/* A quiet wash on hover — the frame should feel pressable without
          growing a chrome toolbar over the photograph. */}
      <span className="pointer-events-none absolute inset-0 bg-pine/0 transition-colors duration-instant group-hover:bg-pine/10" />
      {video && !more && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-paper/85 shadow-lift transition-transform duration-instant group-hover:scale-110">
            <PlayGlyph className="ml-0.5 h-5 w-5 text-pine" />
          </span>
        </span>
      )}
      {more ? (
        <span className="pointer-events-none absolute inset-0 grid place-items-center bg-pine/55">
          <span className="font-mono text-lg font-semibold text-paper">+{more}</span>
        </span>
      ) : null}
    </button>
  );
}
