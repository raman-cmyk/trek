import { useState } from "react";
import { Form } from "react-router";
import { Button } from "~/components/Button";

/**
 * A guide writes a route we do not carry.
 *
 * Deliberately a list, not a map. Somebody who has walked a route twenty times
 * can name its villages and their altitudes from memory in two minutes; asking
 * them to draw a line on a map on a phone is asking for something else
 * entirely, and would get us worse data more slowly. Coordinates can come
 * later — the day list is what a reader needs and what the altitude profile is
 * drawn from.
 */

export interface RouteStopDraft {
  place: string;
  altitude_m: string;
  nights: string;
  note: string;
}

const field =
  "w-full rounded border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss";
const label = "block text-sm text-ink-soft";

export const REGIONS = [
  "Khumbu",
  "Annapurna",
  "Langtang",
  "Manaslu",
  "Mustang",
  "Dolpa",
  "Kanchenjunga",
  "Makalu",
  "Dhaulagiri",
  "Karnali",
  "Sudurpashchim",
  "Rolwaling",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function RouteBuilder({
  submitLabel = "Send it to the office",
  busy,
  initial,
}: {
  submitLabel?: string;
  busy?: boolean;
  initial?: {
    name?: string;
    region?: string;
    start_point?: string;
    end_point?: string;
    summary?: string;
    difficulty?: string;
    season_months?: number[];
    stops?: RouteStopDraft[];
    permits?: Array<{ name: string; cost_usd: string }>;
  };
}) {
  const [stops, setStops] = useState<RouteStopDraft[]>(
    initial?.stops?.length
      ? initial.stops
      : [{ place: "", altitude_m: "", nights: "1", note: "" }],
  );
  const [permits, setPermits] = useState(initial?.permits ?? [{ name: "", cost_usd: "" }]);

  const setStop = (i: number, patch: Partial<RouteStopDraft>) =>
    setStops((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const days = stops.reduce((n, s) => n + Math.max(1, Number(s.nights) || 1), 0);
  const high = stops.reduce((m, s) => Math.max(m, Number(s.altitude_m) || 0), 0);

  return (
    <Form method="post" className="space-y-4">
      <input type="hidden" name="stops" value={JSON.stringify(stops)} />
      <input type="hidden" name="permits" value={JSON.stringify(permits)} />

      <label className={label}>
        What is it called?
        <input
          name="name"
          defaultValue={initial?.name ?? ""}
          maxLength={80}
          placeholder="Tsum Valley via Mu Gompa"
          className={field}
          required
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Region
          <select name="region" defaultValue={initial?.region ?? ""} className={field} required>
            <option value="" disabled>
              — pick one —
            </option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          How hard is it?
          <select name="difficulty" defaultValue={initial?.difficulty ?? "moderate"} className={field}>
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="hard">Hard</option>
            <option value="strenuous">Strenuous</option>
          </select>
        </label>
        <label className={label}>
          Where does it start?
          <input
            name="start_point"
            defaultValue={initial?.start_point ?? ""}
            placeholder="Soti Khola"
            className={field}
            required
          />
        </label>
        <label className={label}>
          Where does it finish?
          <input
            name="end_point"
            defaultValue={initial?.end_point ?? ""}
            placeholder="Dharapani"
            className={field}
            required
          />
        </label>
      </div>

      <label className={label}>
        Two or three sentences on what it is
        <textarea
          name="summary"
          rows={3}
          defaultValue={initial?.summary ?? ""}
          maxLength={400}
          className={field}
          required
        />
      </label>

      <fieldset className="rounded-md border border-line bg-card p-4">
        <legend className="px-1 text-sm font-medium text-ink">Months it can be walked</legend>
        <div className="flex flex-wrap gap-1.5">
          {MONTHS.map((m, i) => (
            <label
              key={m}
              className="cursor-pointer rounded-full border border-line bg-paper px-3 py-1.5 text-caption text-ink has-[:checked]:border-moss has-[:checked]:bg-mist"
            >
              <input
                type="checkbox"
                name="season_months"
                value={i + 1}
                defaultChecked={initial?.season_months?.includes(i + 1) ?? [3, 4, 5, 10, 11].includes(i + 1)}
                className="sr-only"
              />
              {m}
            </label>
          ))}
        </div>
      </fieldset>

      {/* ── The days. ──────────────────────────────────────────────────── */}
      <fieldset className="rounded-md border border-line bg-card p-4">
        <legend className="px-1 text-sm font-medium text-ink">Where you sleep, in order</legend>
        <p className="mb-2 text-caption text-muted">
          One row per place you stop. The altitude is what draws the climb
          profile on the route page.
        </p>
        <ul className="space-y-2">
          {stops.map((s, i) => (
            <li key={i} className="rounded border border-line bg-paper p-2.5">
              <div className="flex gap-2">
                <span className="mt-2.5 font-mono text-caption text-muted">{i + 1}</span>
                <input
                  aria-label={`Place ${i + 1}`}
                  value={s.place}
                  onChange={(e) => setStop(i, { place: e.target.value })}
                  placeholder="Namche Bazaar"
                  className={`${field} min-w-0 flex-1`}
                />
                <input
                  aria-label={`Altitude at stop ${i + 1}`}
                  type="number"
                  inputMode="numeric"
                  value={s.altitude_m}
                  onChange={(e) => setStop(i, { altitude_m: e.target.value })}
                  placeholder="m"
                  className={`${field} w-20 shrink-0`}
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-caption text-muted">
                  Nights here
                  <input
                    aria-label={`Nights at stop ${i + 1}`}
                    type="number"
                    min={1}
                    max={5}
                    value={s.nights}
                    onChange={(e) => setStop(i, { nights: e.target.value })}
                    className="ml-1.5 w-14 rounded border border-line bg-card px-2 py-1 text-sm text-ink"
                  />
                </label>
                {stops.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setStops((all) => all.filter((_, j) => j !== i))}
                    className="ml-auto text-caption text-ember underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() =>
            setStops((s) => [...s, { place: "", altitude_m: "", nights: "1", note: "" }])
          }
          className="mt-2 text-caption text-moss underline underline-offset-4"
        >
          + Add another place
        </button>
        <p className="mt-3 border-t border-line pt-2 text-sm text-ink">
          <span className="font-mono">{days}</span> days ·{" "}
          <span className="font-mono">{high ? high.toLocaleString("en-US") : "—"}</span> m at the
          highest
        </p>
      </fieldset>

      {/* ── Permits. ───────────────────────────────────────────────────── */}
      <fieldset className="rounded-md border border-line bg-card p-4">
        <legend className="px-1 text-sm font-medium text-ink">Permits it needs</legend>
        <p className="mb-2 text-caption text-muted">
          What each one costs per person. The office checks these against the
          current rates before the route goes up.
        </p>
        <ul className="space-y-2">
          {permits.map((p, i) => (
            <li key={i} className="flex gap-2">
              <input
                aria-label={`Permit ${i + 1} name`}
                value={p.name}
                onChange={(e) =>
                  setPermits((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                placeholder="Manaslu restricted-area permit"
                className={`${field} min-w-0 flex-1`}
              />
              <input
                aria-label={`Permit ${i + 1} cost in dollars`}
                type="number"
                step="0.01"
                min={0}
                value={p.cost_usd}
                onChange={(e) =>
                  setPermits((all) =>
                    all.map((x, j) => (j === i ? { ...x, cost_usd: e.target.value } : x)),
                  )
                }
                placeholder="$"
                className={`${field} w-24 shrink-0`}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setPermits((p) => [...p, { name: "", cost_usd: "" }])}
          className="mt-2 text-caption text-moss underline underline-offset-4"
        >
          + Add another permit
        </button>
      </fieldset>

      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : submitLabel}
      </Button>
      <p className="text-caption text-muted">
        The office checks it once. Until then you can put trips on it, but they
        cannot go live.
      </p>
    </Form>
  );
}
