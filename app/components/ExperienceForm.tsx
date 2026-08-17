import { useState } from "react";
import { Form } from "react-router";
import { Button } from "~/components/Button";
import { type PriceBreakdown } from "~/lib/experience-pricing";
import { PriceBuilder, toDraft } from "~/components/PriceBuilder";
import { PhotoGallery, type GalleryPhoto } from "~/components/PhotoGallery";

/**
 * One form for an experience, shared by the guide (/g/experiences) and the
 * office (/ops/experiences).
 *
 * Written for a guide on a phone with second-language English: plain words,
 * one thing per row, money asked for in dollars not cents, and the price a
 * client will actually see computed live at the bottom — a guide should
 * never have to do the platform's arithmetic to know what his trip costs.
 */

export interface ExperienceValues {
  id?: string;
  kind: string;
  title: string;
  summary: string;
  route_id: string | null;
  days: number;
  min_party: number;
  max_party: number;
  cover_photo_url: string | null;
  photos: GalleryPhoto[];
  price_breakdown: PriceBreakdown | null;
  status: string;
}

export const KINDS = [
  ["trek", "Multi-day trek"],
  ["day_hike", "Day hike"],
  ["food_culture", "Food & culture"],
  ["adventure", "Adventure"],
  ["city", "City experience"],
] as const;

const field =
  "mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss";
const label = "block text-sm text-ink-soft";

export function ExperienceForm({
  values,
  routes,
  guideId,
  submitLabel,
  busy,
}: {
  values?: Partial<ExperienceValues>;
  routes: Array<{
    id: string;
    name: string;
    status?: string;
    typical_days?: number | null;
    max_altitude_m?: number | null;
    day_stops?: Array<{ day: number; place: string; altitude_m: number | null }> | null;
    permits?: Array<{ name: string; cost_usd_cents: number }>;
  }>;
  guideId: string;
  submitLabel: string;
  busy?: boolean;
}) {
  const [kind, setKind] = useState(values?.kind ?? "trek");
  // Days is mirrored in state because per-day price lines multiply by it — a
  // guide changing 10 days to 14 must see the price move.
  const [days, setDays] = useState<number>(
    values?.days ?? ((values?.kind ?? "trek") === "trek" ? 12 : 1),
  );
  const [draft] = useState(() => toDraft(values?.price_breakdown ?? null));
  const [routeId, setRouteId] = useState(values?.route_id ?? "");
  const chosen = routes.find((r) => r.id === routeId);
  return (
    <Form method="post" className="space-y-4">
      {values?.id && <input type="hidden" name="experience_id" value={values.id} />}

      <label className={label}>
        What kind of trip is it?
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        Name it the way you would say it
        <input
          name="title"
          defaultValue={values?.title ?? ""}
          maxLength={80}
          placeholder="Gokyo Lakes, properly acclimatised"
          className={field}
          required
        />
      </label>

      <label className={label}>
        Two or three sentences on what makes it yours
        <textarea
          name="summary"
          rows={3}
          defaultValue={values?.summary ?? ""}
          maxLength={400}
          className={field}
          required
        />
      </label>

      {kind === "trek" && (
        <div>
          <label className={label}>
            Which route
            <select
              name="route_id"
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className={field}
              required
            >
              <option value="" disabled>
                — pick the route —
              </option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.status && r.status !== "live" ? " — waiting for the office" : ""}
                </option>
              ))}
            </select>
          </label>
          <a
            href="/g/routes/new"
            className="mt-1.5 inline-block text-caption text-moss underline underline-offset-4"
          >
            My route isn&rsquo;t listed →
          </a>

          {/* What you picked, shown. Choosing a route used to change a dropdown
              and nothing else, so a guide had no way to check they had chosen
              the right one — or to see what the trekker would be reading. */}
          {chosen && (
            <div className="mt-3 rounded-md border border-line bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-ink">{chosen.name}</p>
                <p className="font-mono text-caption text-muted">
                  {chosen.typical_days ? `${chosen.typical_days} days · ` : ""}
                  {chosen.max_altitude_m
                    ? `${chosen.max_altitude_m.toLocaleString("en-US")} m`
                    : ""}
                </p>
              </div>
              {chosen.status && chosen.status !== "live" && (
                <p className="mt-1.5 rounded bg-ember/10 px-2 py-1 text-caption text-ember">
                  The office hasn&rsquo;t checked this route yet. You can build the
                  trip now, but it can&rsquo;t go live until they have.
                </p>
              )}
              {chosen.day_stops?.length ? (
                <>
                  <AltitudeProfile stops={chosen.day_stops} />
                  <ol className="mt-2 space-y-0.5 text-caption text-ink-soft">
                    {chosen.day_stops.map((s) => (
                      <li key={`${s.day}-${s.place}`} className="flex justify-between gap-3">
                        <span>
                          <span className="font-mono text-muted">Day {s.day}</span> {s.place}
                        </span>
                        {s.altitude_m ? (
                          <span className="font-mono text-muted">
                            {s.altitude_m.toLocaleString("en-US")} m
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
              {chosen.permits?.length ? (
                <ul className="mt-3 border-t border-line pt-2 text-caption text-ink-soft">
                  {chosen.permits.map((p) => (
                    <li key={p.name} className="flex justify-between gap-3">
                      <span>{p.name}</span>
                      <span className="font-mono text-muted">
                        ${(p.cost_usd_cents / 100).toFixed(0)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <label className={label}>
          Days
          <input type="number" name="days" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} className={field} required />
        </label>
        <label className={label}>
          Smallest group
          <input type="number" name="min_party" min={1} max={16} defaultValue={values?.min_party ?? 1} className={field} required />
        </label>
        <label className={label}>
          Largest group
          <input type="number" name="max_party" min={1} max={16} defaultValue={values?.max_party ?? 6} className={field} required />
        </label>
      </div>

      {/* ── The money. A library of lines, and the arithmetic done for them. */}
      <PriceBuilder kind={kind} days={days} initial={draft} />

      {/* ── The photographs. The cover is simply the first of them. */}
      <PhotoGallery initial={values?.photos ?? []} guideId={guideId} />

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </Button>
    </Form>
  );
}

/**
 * The climb, drawn from the altitudes the route already carries. A line is the
 * only honest way to show "day nine is where it gets high" — a column of
 * numbers is not read, and a guide picking a route needs to recognise it at a
 * glance.
 */
function AltitudeProfile({
  stops,
}: {
  stops: Array<{ day: number; place: string; altitude_m: number | null }>;
}) {
  const pts = stops.filter((s) => s.altitude_m);
  if (pts.length < 2) return null;
  const hi = Math.max(...pts.map((s) => s.altitude_m!));
  const lo = Math.min(...pts.map((s) => s.altitude_m!));
  const span = Math.max(1, hi - lo);
  const d = pts
    .map((s, i) => {
      const x = (i / (pts.length - 1)) * 100;
      const y = 28 - ((s.altitude_m! - lo) / span) * 24;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className="mt-2.5 h-12 w-full"
      role="img"
      aria-label={`Climbs to ${hi.toLocaleString("en-US")} metres`}
    >
      <path d={`${d} L100,30 L0,30 Z`} fill="currentColor" className="text-mist" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1" className="text-moss" />
    </svg>
  );
}
