import { Link } from "react-router";
import { SmartImage } from "~/components/SmartImage";
import { GradeGlyph, RouteProfile } from "~/components/public/RouteProfile";
import { useMoney } from "~/lib/currency-context";
import { gradeLevel, isRange, type Profile } from "~/lib/route-cards";

export interface CardGuide {
  slug: string;
  name: string;
  avatar: string | null;
}

export interface RouteCardData {
  slug: string;
  name: string;
  region: string;
  typical_days: number;
  max_altitude_m: number;
  difficulty: string;
  summary: string | null;
  season: string;
  photo: string | null;
  profile: Profile | null;
  lo: number | null;
  hi: number | null;
  guides: number;
  faces: CardGuide[];
}

/**
 * One route, as a card.
 *
 * The visual is the photograph where there is one and the trek's own
 * elevation profile where there is not — and on a photograph the profile is
 * still there, along the bottom, because the shape of the climb is the thing
 * that separates these twenty-four walks from each other.
 *
 * The price is a range. A route does not have a price; guides do, and "from
 * $398" quietly hides the nine guides who are not the cheapest one.
 */
export function RouteCard({
  route,
  featured = false,
  eager = false,
}: {
  route: RouteCardData;
  featured?: boolean;
  eager?: boolean;
}) {
  // Rounded: a trek is not priced to the cent, and "$397.76–$463.30" is two
  // numbers nobody can compare at a glance.
  const { mr } = useMoney();
  const height = featured ? 190 : 132;
  const spread = { lo: route.lo, hi: route.hi, guides: route.guides };
  const altitude = route.max_altitude_m?.toLocaleString("en-US") ?? "—";
  const profileLabel =
    route.profile
      ? `${route.name}: ${route.typical_days} days, ${route.profile.lowest.toLocaleString("en-US")} to ${route.profile.highest.toLocaleString("en-US")} metres`
      : route.name;

  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-line bg-card transition duration-quick hover:border-sage hover:shadow-lift">
      <Link to={`/routes/${route.slug}`} prefetch="intent" className="block">
        {/* One box, one shape, photo or not — otherwise a row of cards steps
            up and down as the routes with photographs run out. */}
        <div
          className={`relative overflow-hidden bg-gradient-to-b from-mist to-sage/35 ${
            featured ? "aspect-[16/9]" : "aspect-[16/7]"
          }`}
        >
          {route.photo ? (
            <>
              <SmartImage
                src={route.photo}
                alt={`${route.name} trek`}
                width={800}
                height={featured ? 450 : 350}
                eager={eager}
                cover
                className="absolute inset-0 h-full w-full"
                imgClassName="transition duration-slow group-hover:scale-[1.03]"
              />
              {/* The profile rides the bottom of the photo, over a scrim so a
                  white line stays a white line on a snowfield. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0">
                <div className="h-16 bg-gradient-to-t from-ink/55 to-transparent" />
                {route.profile && (
                  <div className="-mt-14">
                    <RouteProfile
                      profile={route.profile}
                      variant="photo"
                      height={56}
                      bold={featured}
                      label={profileLabel}
                      className="block h-14 w-full"
                    />
                  </div>
                )}
              </div>
            </>
          ) : route.profile ? (
            <RouteProfile
              profile={route.profile}
              height={height}
              bold={featured}
              label={profileLabel}
              className="absolute inset-0 block h-full w-full"
            />
          ) : null}

          <span className="absolute left-3 top-3 rounded-pill bg-card/85 px-2.5 py-1 text-caption font-medium text-pine backdrop-blur-sm">
            {route.region}
          </span>
          <span className="absolute right-3 top-3 rounded-pill bg-card/85 px-2.5 py-1 text-caption text-muted backdrop-blur-sm">
            <b className="font-mono font-semibold text-ink">{altitude}</b> m
          </span>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3
            className={`font-display text-ink ${featured ? "text-display-m" : "text-xl"} leading-tight`}
          >
            <Link to={`/routes/${route.slug}`} prefetch="intent" className="hover:text-moss">
              {route.name}
            </Link>
          </h3>
          <span className="whitespace-nowrap text-right font-mono text-sm font-medium text-moss">
            {spread.lo == null ? (
              // Nobody has priced it. With guides on it that is a question
              // worth asking; with none, the footer already says so.
              route.guides > 0 ? <span className="text-muted">Ask a guide</span> : null
            ) : isRange(spread) ? (
              <>
                {mr(spread.lo)}–{mr(spread.hi!)}
              </>
            ) : (
              <>from {mr(spread.lo)}</>
            )}
          </span>
        </div>

        {route.summary && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{route.summary}</p>
        )}

        {/* Days, grade and the months — the three questions asked of every
            trek, in the same three places on every card. */}
        <dl className="mt-4 flex overflow-hidden rounded-md border border-line">
          <div className="flex-1 border-r border-line px-3 py-2">
            <dd className="font-mono text-base font-semibold leading-none text-ink">
              {route.typical_days}
            </dd>
            <dt className="mt-1.5 text-caption text-muted">days</dt>
          </div>
          <div className="flex-1 border-r border-line px-3 py-2">
            <dd className="flex h-4 items-end">
              <GradeGlyph level={gradeLevel(route.difficulty)} label={route.difficulty} />
            </dd>
            <dt className="mt-1.5 text-caption capitalize text-muted">{route.difficulty}</dt>
          </div>
          <div className="flex-[1.6] px-3 py-2">
            <dd className="text-xs font-medium leading-none text-ink">{route.season || "—"}</dd>
            <dt className="mt-1.5 text-caption text-muted">best months</dt>
          </div>
        </dl>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3.5">
          <GuideFaces faces={route.faces} count={route.guides} />
          <Link
            to={`/routes/${route.slug}`}
            prefetch="intent"
            className="whitespace-nowrap rounded-pill border border-line bg-paper px-3.5 py-2 text-caption font-medium text-ink transition duration-quick hover:border-moss hover:bg-moss hover:text-paper"
          >
            {route.guides === 1 ? "Meet the guide" : route.guides > 1 ? "Meet the guides" : "See the route"}
          </Link>
        </div>
      </div>
    </article>
  );
}

/** The real faces of the guides who walk it — stacked, then counted. */
function GuideFaces({ faces, count }: { faces: CardGuide[]; count: number }) {
  if (count === 0) {
    return <span className="text-caption text-muted">No guide listed yet</span>;
  }
  // Three faces, not four: the fourth cost more width than it bought, and the
  // count beside them was the half that got truncated.
  const shown = faces.slice(0, 3);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex -space-x-2">
        {shown.map((g) => (
          <span
            key={g.slug}
            title={g.name}
            className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-card bg-pine text-caption font-semibold text-paper"
          >
            {g.avatar ? (
              <img
                src={g.avatar}
                alt=""
                width={28}
                height={28}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              g.name.charAt(0)
            )}
          </span>
        ))}
      </span>
      <span className="truncate text-caption text-muted">
        <b className="font-mono font-semibold text-ink">{count}</b> verified
      </span>
    </span>
  );
}
