import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { RouteProfile } from "~/components/public/RouteProfile";
import { cn } from "~/lib/cn";
import type { Profile } from "~/lib/route-cards";

/**
 * A photograph as a card, with its words on a glass panel (docs/07, from
 * references 4 and 5 — "Fern loop · 42 min · 2.8 km · Easy" on a dark panel
 * at the foot of a forest photo).
 *
 * The whole card is the link. What sits on the panel is the caller's — a
 * title, a fact strip, chips, a chip of the guide's face — because the
 * pictures differ (a trip, a journal, a route) and the words that belong on
 * them differ too. Without a photo the card is a terrain drawing, never a
 * blank box.
 */
export function PhotoCard({
  to,
  photo,
  alt,
  profile,
  aspect = "aspect-[4/5]",
  panel = "dark",
  eager = false,
  className,
  topLeft,
  topRight,
  children,
}: {
  to: string;
  photo?: string | null;
  alt: string;
  profile?: Profile | null;
  aspect?: string;
  panel?: "dark" | "light" | "none";
  eager?: boolean;
  className?: string;
  /** Something small pinned to the top corners — a kind chip, an altitude. */
  topLeft?: React.ReactNode;
  topRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const hasPhoto = Boolean(photo && photo.trim());
  return (
    <Link
      to={to}
      prefetch="intent"
      className={cn(
        "group relative block overflow-hidden rounded-photo bg-mist shadow-card transition duration-quick ease-out-soft hover:-translate-y-0.5 hover:shadow-lift",
        aspect,
        className,
      )}
    >
      {hasPhoto ? (
        <SmartImage
          src={photo!}
          alt={alt}
          width={800}
          height={1000}
          eager={eager}
          cover
          className="absolute inset-0 h-full w-full"
          imgClassName="transition duration-slow group-hover:scale-[1.03]"
        />
      ) : (
        <div className="placeholder-contour absolute inset-0" aria-hidden="true">
          {profile && (
            <div className="absolute inset-x-0 bottom-0 top-[35%]">
              <RouteProfile profile={profile} variant="paper" height={140} label={alt} className="block h-full w-full" />
            </div>
          )}
        </div>
      )}
      {panel === "dark" && (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t to-transparent",
            hasPhoto ? "from-ink/75 via-ink/25" : "from-paper/90 via-paper/40",
          )}
        />
      )}
      {(topLeft || topRight) && (
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <div>{topLeft}</div>
          <div>{topRight}</div>
        </div>
      )}
      {children && (
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 p-3.5",
            panel === "light" && "glass m-2 rounded-photo text-ink",
            panel === "dark" && (hasPhoto ? "text-paper" : "text-ink"),
            panel === "none" && "text-paper",
          )}
        >
          {children}
        </div>
      )}
    </Link>
  );
}
