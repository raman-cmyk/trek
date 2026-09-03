import { useEffect, useState } from "react";

/**
 * Which trails a guide has walked, and how many times.
 *
 * The public profile used to answer this by counting published journals, so a
 * guide with forty Manaslu crossings and two write-ups showed "×2". That
 * number sits on the most important line of their profile and it was measuring
 * our content, not their life. Now they say it themselves.
 *
 * Starts empty and grows a row at a time: a guide filling this in on a 360px
 * phone should see the three routes they walk, not the whole catalogue.
 */

export interface RouteOption {
  id: string;
  name: string;
  region: string | null;
}

export interface RouteWalk {
  routeId: string;
  timesWalked: number;
}

const field =
  "min-w-0 rounded-button border border-border bg-card px-3 py-2 text-base text-ink outline-none focus:border-primary";

export function RouteExperience({
  name = "routes_walked",
  routes,
  initial,
  onChange,
}: {
  name?: string;
  routes: RouteOption[];
  initial?: RouteWalk[];
  onChange?: (rows: RouteWalk[]) => void;
}) {
  const [rows, setRows] = useState<RouteWalk[]>(initial ?? []);
  useEffect(() => onChange?.(rows), [rows, onChange]);

  const taken = new Set(rows.map((r) => r.routeId));
  const spare = routes.find((r) => !taken.has(r.id));

  const set = (i: number, patch: Partial<RouteWalk>) =>
    setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  if (!routes.length) {
    return <p className="text-sm text-ink-soft">No routes to pick from yet.</p>;
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.routeId} className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Route"
                value={r.routeId}
                onChange={(e) => set(i, { routeId: e.target.value })}
                className={`${field} flex-1 basis-40`}
              >
                {routes
                  .filter((o) => o.id === r.routeId || !taken.has(o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.region ? ` — ${o.region}` : ""}
                    </option>
                  ))}
              </select>
              <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink-soft">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={r.timesWalked}
                  onChange={(e) =>
                    set(i, { timesWalked: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })
                  }
                  aria-label="How many times you have walked it"
                  className={`${field} w-20`}
                />
                times
              </label>
              <button
                type="button"
                onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                className="shrink-0 px-1 text-sm text-ink-soft hover:text-danger"
                aria-label="Remove this route"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {spare ? (
        <button
          type="button"
          onClick={() => setRows((all) => [...all, { routeId: spare.id, timesWalked: 1 }])}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          + Add a route
        </button>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">Every route is listed.</p>
      )}
    </div>
  );
}

/**
 * Parse the hidden JSON field. Same defensive shape as the price builder:
 * anything unrecognised is dropped rather than allowed to break an insert,
 * counts are clamped to the column's CHECK, and duplicates are collapsed
 * because (guide_id, route_id) is the primary key.
 */
export function parseRoutesWalked(raw: unknown, validRouteIds: Set<string>): RouteWalk[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: RouteWalk[] = [];
  for (const row of parsed) {
    const routeId = String((row as any)?.routeId ?? "");
    if (!validRouteIds.has(routeId) || seen.has(routeId)) continue;
    const n = Math.round(Number((row as any)?.timesWalked));
    if (!Number.isFinite(n) || n < 1) continue;
    seen.add(routeId);
    out.push({ routeId, timesWalked: Math.min(500, n) });
    if (out.length >= 60) break;
  }
  return out;
}
