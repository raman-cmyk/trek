import { useLightbox } from "~/components/public/Lightbox";
import { splitPhotos } from "~/lib/message-photos";
import {
  formatCoords,
  googleMapsUrl,
  splitLocations,
  type SharedLocation,
} from "~/lib/message-location";
import { linkParts, shortLink } from "~/lib/linkify";
import { cn } from "~/lib/cn";

/**
 * The text of one message, and any photos in it.
 *
 * Both threads render through here — the one-to-one one and the group one —
 * because a photo that appears as a picture in a booking chat and as a raw
 * URL in the trip group is the kind of difference nobody can explain to a
 * trekker. Tapping opens it full-size: a 288px-tall preview of a passport
 * page or a boot is not enough to answer the question that was asked with it.
 */
export function MessageBody({ body, className }: { body: string; className?: string }) {
  // Places come out first: a map link is a link, and splitPhotos would leave
  // it sitting in the text as ninety characters of query string.
  const { text: withoutPlaces, locations } = splitLocations(body);
  const { text, photos } = splitPhotos(withoutPlaces);
  const viewer = useLightbox(photos.map((url) => ({ url, alt: "Shared photo" })));

  return (
    <>
      {locations.length > 0 && (
        <div className={cn("flex flex-col gap-1.5", (text || photos.length > 0) && "mb-1.5")}>
          {locations.map((loc, i) => (
            <LocationCard key={i} loc={loc} />
          ))}
        </div>
      )}
      {photos.length > 0 && (
        <div className={cn("flex flex-col gap-1.5", text && "mb-1.5")}>
          {photos.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => viewer.open(i)}
              className="block overflow-hidden rounded-lg"
              aria-label="Open photo"
            >
              <img
                src={url}
                alt="Shared photo"
                className="max-h-72 w-auto max-w-full rounded-lg object-cover"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}
      {text && (
        <p className={cn("whitespace-pre-wrap break-words", className)}>
          <Linked text={text} />
        </p>
      )}
      {/* A message that is only a photo still needs something for a screen
          reader to announce, and the picture's alt text is not it. */}
      {!text && photos.length > 0 && (
        <span className="sr-only">
          {photos.length === 1 ? "A photo" : `${photos.length} photos`}
        </span>
      )}
      {viewer.node}
    </>
  );
}

/**
 * A place, as a card you can act on.
 *
 * No map tiles: this renders on a cheap Android over 3G in a lodge, and a
 * tile fetch per message is the difference between a thread that loads and
 * one that does not. What it gives instead is everything you need to act —
 * the label somebody typed, the altitude if their phone knew it, the
 * coordinates to read out over a radio, and one tap into whichever map app
 * they actually have.
 */
function LocationCard({ loc }: { loc: SharedLocation }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-paper">
      <div className="flex items-start gap-2.5 p-3">
        <PinMark />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{loc.label ?? "Shared a location"}</p>
          <p className="mt-0.5 font-mono text-caption text-muted">
            {loc.altitudeM != null && (
              <>
                <span className="text-ink">{loc.altitudeM.toLocaleString("en-US")} m</span>
                {" · "}
              </>
            )}
            {formatCoords(loc.lat, loc.lng)}
          </p>
        </div>
      </div>
      {/* Two, because half of Nepal navigates on Google and the office uses
          OpenStreetMap, and neither should have to copy coordinates by hand. */}
      <div className="grid grid-cols-2 divide-x divide-line border-t border-line text-center text-caption">
        <a
          href={googleMapsUrl(loc.lat, loc.lng)}
          target="_blank"
          rel="noreferrer"
          className="py-2 font-medium text-moss hover:bg-mist"
        >
          Open in Maps
        </a>
        <a
          href={loc.url}
          target="_blank"
          rel="noreferrer"
          className="py-2 font-medium text-moss hover:bg-mist"
        >
          Open the link
        </a>
      </div>
    </div>
  );
}

/**
 * The text, with anything tappable made tappable.
 *
 * A map link we could not read coordinates out of — a Google short link, say
 * — still has to be a link, because the alternative on a phone is selecting
 * ninety characters by hand. Rendered as parts rather than as HTML, so a
 * message containing angle brackets stays a message containing angle
 * brackets.
 */
function Linked({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((part, i) =>
        part.kind === "link" ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noreferrer nofollow"
            className="break-all font-medium text-moss underline underline-offset-2"
          >
            {shortLink(part.value)}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

function PinMark() {
  return (
    <svg
      width="18"
      height="20"
      viewBox="0 0 12 14"
      fill="none"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      <path d="M6 13.2S11 8.3 11 5.1A5 5 0 0 0 1 5.1C1 8.3 6 13.2 6 13.2z" fill="var(--color-ember)" />
      <circle cx="6" cy="5" r="1.7" fill="var(--color-paper)" />
    </svg>
  );
}
