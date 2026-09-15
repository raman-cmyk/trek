import { Eyebrow } from "~/components/design/Eyebrow";
import { Glyph, type ChipGlyph } from "~/components/design/Chip";
import { StatRow, StatTile } from "~/components/design/StatTile";
import { legsOf, totalAscent, totalDescent, type DayLeg, type RouteStop } from "~/lib/trek-day";
import { dayDetail, routeHigh } from "~/lib/trek-day-detail";
import {
  knowBeforeYouGo,
  packingList,
  type RouteFacts,
} from "~/lib/trek-knowledge";
import { cn } from "~/lib/cn";

/**
 * The half of a route page we did not have.
 *
 * A trekking page has to answer roughly fifty questions before somebody will
 * put $1,200 on a card: how long is each day, where do I sleep, what do I
 * carry, what happens if I get ill up there. Every agency page in Nepal
 * answers them and ours answered five, which is the gap the founder found by
 * putting our page beside theirs.
 *
 * Route-specific answers come from the database and ops edits them; the
 * universal ones are generated from `trek-knowledge` against this route's own
 * altitude and permits, so they cannot drift page to page the way a
 * copy-pasted block does.
 */

/** The dozen lines that make somebody want this walk rather than another. */
export function Highlights({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="mt-12">
      <Eyebrow as="h2">Why this one</Eyebrow>
      <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {items.map((h, i) => (
          <li key={i} className="flex gap-3 text-ink">
            <Glyph name="mountain" className="mt-1 shrink-0 text-moss" />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Several paragraphs — the piece somebody reads when they are deciding. */
export function Overview({ text, name }: { text: string | null; name: string }) {
  if (!text?.trim()) return null;
  return (
    <section className="mt-12">
      <Eyebrow as="h2">The walk</Eyebrow>
      <div className="mt-3 max-w-[64ch] space-y-4 text-body-l text-ink">
        {text.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p.trim()}</p>
        ))}
      </div>
      <p className="sr-only">An overview of the {name} trek.</p>
    </section>
  );
}

/**
 * The itinerary, with what a day actually costs you.
 *
 * Climb and drop are worked out from the altitudes we already store, so they
 * are exact. The hours are an estimate from the climb until a guide or the
 * office types the real figure in — and the page says which it is looking at,
 * every time, because a made-up number presented as a measured one is the
 * thing this whole product exists not to do.
 */
export function DayByDay({
  stops,
  activeDay,
  onDayChange,
}: {
  stops: RouteStop[];
  activeDay?: number | null;
  onDayChange?: (day: number | null) => void;
}) {
  const legs = legsOf(stops);
  if (legs.length === 0) return null;
  const anyEstimated = legs.some((l) => l.hours && l.hoursEstimated);
  const high = routeHigh(stops);

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Eyebrow as="h2">Day by day</Eyebrow>
        <p className="font-mono text-caption text-muted">
          <span className="text-ink">{totalAscent(stops).toLocaleString("en-US")} m</span> up ·{" "}
          <span className="text-ink">{totalDescent(stops).toLocaleString("en-US")} m</span> down
        </p>
      </div>

      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-photo border border-line bg-card">
        {legs.map((l, i) => (
          <li key={l.day}>
            <div
              className={cn("group", activeDay === l.day && "bg-mist/40")}
              onMouseEnter={() => onDayChange?.(l.day)}
              onMouseLeave={() => onDayChange?.(null)}
            >
              {/* Fixed columns, not a right-aligned huddle: a reader compares
                  day four's climb against day seven's by running an eye down
                  the page, which only works if the numbers line up. */}
              <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 px-4 pt-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_7.5rem_6rem_5rem]">
                <span className="font-mono text-sm text-muted">{l.day}</span>
                <span className="min-w-0 font-medium text-ink">
                  {l.place}
                  {l.rest && (
                    <span className="ml-2 rounded-pill bg-mist px-2 py-0.5 text-caption font-normal text-moss">
                      rest day
                    </span>
                  )}
                </span>
                <DayFacts leg={l} />
              </div>
              {/* Open, not behind a click.
                  These descriptions were written and stored all along — "Rice
                  terraces, waterfalls, warm air", "Into the gorge" — and the
                  row hid them, so twelve days read as twelve rows of bare
                  numbers. Alongside them, what the altitudes mean: derived
                  from the exact figures we store, with the rule named, never
                  invented. */}
              <div className="px-4 pb-3.5 pl-[3.25rem] text-sm">
                {l.note && <p className="max-w-[62ch] text-ink-soft">{l.note}</p>}

                {dayDetail({
                  day: l.day,
                  place: l.place,
                  altitude_m: l.altitude_m,
                  up: l.up,
                  down: l.down,
                  rest: l.rest,
                  sleptAtM: i > 0 ? legs[i - 1].altitude_m : null,
                  routeHighM: high,
                }).map((d) => (
                  <p
                    key={d.text}
                    className={cn(
                      "mt-1.5 flex max-w-[62ch] gap-2",
                      d.tone === "watch" ? "text-ink" : "text-muted",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full",
                        d.tone === "watch"
                          ? "bg-ember"
                          : d.tone === "relief"
                            ? "bg-moss"
                            : "bg-sage",
                      )}
                    />
                    <span>{d.text}</span>
                  </p>
                ))}

                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
                  {l.sleep && (
                    <span className="flex items-center gap-1.5">
                      <Glyph name="tent" className="text-moss" />
                      {l.sleep}
                    </span>
                  )}
                  {l.km != null && (
                    <span className="font-mono">{l.km} km</span>
                  )}
                  <span className="font-mono">
                    sleeps at {l.altitude_m.toLocaleString("en-US")} m
                  </span>
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {anyEstimated && (
        <p className="mt-2 text-caption text-muted">
          Walking times marked <span className="text-ink">about</span> are worked out from the
          climb, not measured. Your guide will tell you the real pace for your group — and
          plenty of days are shorter than this if you want them to be.
        </p>
      )}
    </section>
  );
}

/**
 * Hours, climb, drop and height — the line every competitor carries and ours
 * did not.
 *
 * Three columns on a wide screen so they align down the page; on a phone they
 * fold into one row under the place name, because five columns at 400px is
 * five columns of nothing.
 */
function DayFacts({ leg }: { leg: DayLeg }) {
  const cell = "text-caption text-muted";
  return (
    <>
      <span className={cn(cell, "col-start-2 sm:col-start-3 sm:text-right")}>
        {leg.hours ? (
          <>
            {leg.hoursEstimated && <span className="mr-1">about</span>}
            <span className="whitespace-nowrap font-mono text-ink">{leg.hours}</span>
          </>
        ) : null}
        {leg.km ? (
          <span className="ml-2">
            <span className="font-mono text-ink">{leg.km}</span> km
          </span>
        ) : null}
      </span>
      <span className={cn(cell, "sm:text-right")}>
        {leg.up > 0 && (
          <span className="mr-2">
            ↑<span className="font-mono text-ink">{leg.up.toLocaleString("en-US")}</span>
          </span>
        )}
        {leg.down > 0 && (
          <span>
            ↓<span className="font-mono text-ink">{leg.down.toLocaleString("en-US")}</span>
          </span>
        )}
        {(leg.up > 0 || leg.down > 0) && <span className="ml-0.5">m</span>}
      </span>
      <span className={cn(cell, "font-mono text-ink sm:text-right")}>
        {leg.altitude_m.toLocaleString("en-US")} m
      </span>
    </>
  );
}

/**
 * How you get to the start, what the lodges are like, what there is to eat.
 *
 * All three are route-specific and all three are in the database, so an
 * office that learns the jeep now costs more can fix it in a minute without
 * a deploy. Any of them missing simply does not render — a heading over an
 * empty box is worse than no heading.
 */
export function GettingThere({
  gettingThere,
  accommodation,
  food,
  water,
}: {
  gettingThere: string | null;
  accommodation: string | null;
  food: string | null;
  water: string | null;
}) {
  const rows = [
    { id: "there", title: "Getting to the start", glyph: "route" as ChipGlyph, text: gettingThere },
    { id: "sleep", title: "Where you sleep on this trail", glyph: "tent" as ChipGlyph, text: accommodation },
    { id: "food", title: "Eating on this trail", glyph: "spark" as ChipGlyph, text: food },
    { id: "water", title: "Water", glyph: "check" as ChipGlyph, text: water },
  ].filter((r) => r.text?.trim());
  if (rows.length === 0) return null;

  return (
    <section className="mt-12">
      <Eyebrow as="h2">On this route</Eyebrow>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-photo border border-line bg-card p-5">
            <h3 className="flex items-center gap-2 font-medium text-ink">
              <Glyph name={r.glyph} className="text-moss" />
              {r.title}
            </h3>
            <div className="mt-2 space-y-2 text-sm text-ink-soft">
              {r.text!.split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p.trim()}</p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The single most-printed page on any trekking site, which we did not have. */
export function Packing({ route, extra }: { route: RouteFacts; extra?: string[] | null }) {
  const groups = packingList(route);
  return (
    <section className="mt-12">
      <Eyebrow as="h2">What to pack</Eyebrow>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        For a walk of this length at this height. Everything here is buyable or
        rentable in Kathmandu and Pokhara for a fraction of what it costs at
        home, so bring what you own and pick up the rest when you land.
      </p>

      {extra?.length ? (
        <div className="mt-5 rounded-photo border border-moss/40 bg-mist p-5">
          <h3 className="flex items-center gap-2 font-medium text-ink">
            <Glyph name="spark" className="text-moss" />
            Just for {route.name}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {extra.map((x, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-moss">
                  ·
                </span>
                {x}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id} className="rounded-photo border border-line bg-card p-5">
            <h3 className="flex items-center gap-2 font-medium text-ink">
              <Glyph name={g.glyph as ChipGlyph} className="text-moss" />
              {g.title}
            </h3>
            <ul className="mt-2.5 space-y-1.5 text-sm text-ink-soft">
              {g.items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
                  <span>{it}</span>
                </li>
              ))}
            </ul>
            {g.note && <p className="mt-3 border-t border-line pt-2.5 text-caption text-muted">{g.note}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Altitude, insurance, rescue, permits, money, power, porters, tipping,
 * etiquette — open on the page rather than hidden, because this is the part
 * that earns the search traffic and the trust.
 *
 * The first two are open by default: they are the ones that can hurt you.
 */
export function KnowBeforeYouGo({ route }: { route: RouteFacts }) {
  const sections = knowBeforeYouGo(route);
  return (
    <section className="mt-12">
      <Eyebrow as="h2">Before you go</Eyebrow>
      <p className="mt-3 max-w-[62ch] text-ink-soft">
        The honest answers, for this route at this height. Ask your guide
        anything that is not here — they answer on their own profile, in public,
        with their name on it.
      </p>
      <div className="mt-5 divide-y divide-line overflow-hidden rounded-photo border border-line bg-card">
        {sections.map((s, i) => (
          <details key={s.id} className="group" open={i < 2 || undefined}>
            <summary className="flex cursor-pointer items-center gap-2.5 px-5 py-3.5 font-medium text-ink hover:bg-mist">
              <Glyph name={s.glyph as ChipGlyph} className="shrink-0 text-moss" />
              <span className="flex-1">{s.title}</span>
              <span
                aria-hidden
                className="shrink-0 text-muted transition-transform duration-quick group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="space-y-3 px-5 pb-5 pl-[3.1rem] text-sm text-ink-soft">
              {s.body.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
              {s.bullets && (
                <ul className="space-y-1.5 pt-1">
                  {s.bullets.map((b, j) => (
                    <li key={j} className="flex gap-2">
                      <span aria-hidden className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-sage" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** The quick-facts box every competitor puts under the title. */
export function TripFacts({
  stops,
  days,
  maxAltitudeM,
  distanceKm,
  difficulty,
}: {
  stops: RouteStop[];
  days: number | null;
  maxAltitudeM: number | null;
  distanceKm: number | null;
  difficulty: string | null;
}) {
  const up = totalAscent(stops);
  return (
    <StatRow className="mt-8" cols={4}>
      <StatTile glyph="calendar" value={days ?? "—"} unit="days" label="On the trail" />
      <StatTile
        glyph="altitude"
        value={maxAltitudeM ? maxAltitudeM.toLocaleString("en-US") : "—"}
        unit="m"
        label="Highest night or pass"
      />
      {up > 0 ? (
        <StatTile glyph="mountain" value={up.toLocaleString("en-US")} unit="m" label="Total climb" />
      ) : (
        <StatTile glyph="walk" value={distanceKm ?? "—"} unit="km" label="Distance" />
      )}
      <StatTile
        glyph="walk"
        value={<span className="capitalize">{difficulty ?? "—"}</span>}
        label="Grade"
      />
    </StatRow>
  );
}
