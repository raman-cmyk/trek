import { SmartImage } from "~/components/SmartImage";
import { cn } from "~/lib/cn";
import { profilePath, type Profile } from "~/lib/route-cards";

export interface PinnedPhoto {
  /** Which day it was taken — where it pins on the line. */
  day: number;
  url: string;
  alt: string;
  caption?: string | null;
}

/**
 * The elevation profile with photographs pinned along it (docs/07, from
 * reference 3 — the summit line with thumbnails at the points they were
 * taken). The line is the trek's real shape; the pictures are the guide's own
 * from that day. A journal's day-by-day, in one picture.
 *
 * Pins are placed by day against the profile's stops, so a photo from day 7
 * sits over day 7's altitude. At most six thumbnails, spread by day; the rest
 * are in the journal below.
 */
export function ProfileWithPhotos({
  profile,
  photos,
  label,
  className,
}: {
  profile: Profile;
  photos: PinnedPhoto[];
  label: string;
  className?: string;
}) {
  const W = 600;
  const H = 150;
  const pad = { x: 8, top: 44, bottom: 14 };
  const { line, area } = profilePath(profile, W, H, pad);

  // One photo per day, up to six, spread across the walk.
  const byDay = new Map<number, PinnedPhoto>();
  for (const p of photos) if (!byDay.has(p.day)) byDay.set(p.day, p);
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const keep = days.length <= 6 ? days : days.filter((_, i) => i % Math.ceil(days.length / 6) === 0).slice(0, 6);
  const pins = keep.map((day) => {
    const pt = nearestPoint(profile, day);
    return { photo: byDay.get(day)!, x: (pad.x + pt.t * (W - pad.x * 2)) / W, y: (pad.top + (1 - pt.v) * (H - pad.top - pad.bottom)) / H };
  });

  return (
    <div className={cn("relative", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="block h-40 w-full sm:h-48">
        <defs>
          <linearGradient id="pwp-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-sage)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--color-moss)" stopOpacity="0.1" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#pwp-fill)" />
        <path d={line} fill="none" stroke="var(--color-pine)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {pins.map((p, i) => (
          <line key={i} x1={p.x * W} y1={p.y * H} x2={p.x * W} y2={p.y * H - 22} stroke="var(--color-pine)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {pins.map((p, i) => (
        <figure
          key={i}
          // Six thumbnails overlap at 400px; every other one waits for a wider screen.
          className={cn("absolute z-10", pins.length > 4 && i % 2 === 1 && "hidden sm:block")}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: "translate(-50%, calc(-100% - 22px))" }}
        >
          <SmartImage
            src={p.photo.url}
            alt={p.photo.alt}
            width={96}
            height={96}
            className="h-12 w-12 rounded-[10px] ring-2 ring-card shadow-lift sm:h-14 sm:w-14"
          />
          <figcaption className="mt-1 hidden max-w-[7rem] truncate text-center font-mono text-[10px] text-muted sm:block">
            Day {p.photo.day}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function nearestPoint(profile: Profile, day: number) {
  let best = profile.points[0];
  for (const p of profile.points) if (Math.abs(p.day - day) < Math.abs(best.day - day)) best = p;
  return best;
}
