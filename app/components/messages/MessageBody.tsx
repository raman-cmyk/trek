import { useLightbox } from "~/components/public/Lightbox";
import { splitPhotos } from "~/lib/message-photos";
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
  const { text, photos } = splitPhotos(body);
  const viewer = useLightbox(photos.map((url) => ({ url, alt: "Shared photo" })));

  return (
    <>
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
        <p className={cn("whitespace-pre-wrap break-words", className)}>{text}</p>
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
