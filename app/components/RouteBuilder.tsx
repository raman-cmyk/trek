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
  onSubmitData,
}: {
  submitLabel?: string;
  busy?: boolean;
  /**
   * Handle the submission here instead of posting to the page's own action.
   *
   * The experience form needs these exact fields, but it is already inside a
   * <form>, and a form inside a form is markup a browser silently unpicks. So
   * when this is set the builder is a plain form that hands its FormData back,
   * and the caller renders it as a sibling of its own form rather than inside
   * it. Same fields, same validation on the server.
   */
  onSubmitData?: (fd: FormData) => void;
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

  const Shell: any = onSubmitData ? "form" : Form;
  const shellProps: any = onSubmitData
    ? {
        onSubmit: (e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          onSubmitData(new FormData(e.currentTarget));
        },
      }
    : { method: "post" };

  return (
    <Shell {...shellProps} className="space-y-4">
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
          One card per place you sleep. The days number themselves from the
          nights, the height draws the climb profile, and what you write here
          is the day-by-day a trekker reads on the route page.
        </p>
        {/* A day-by-day, framed as days.
            This was one cramped row per stop: a place box, an altitude box and
            a nights box, with no room to say what actually happens on the day.
            The two inputs also fought over their width — `field` already
            carries w-full, and the altitude box added w-20 shrink-0, so
            Tailwind's w-full won and the box refused to shrink: the altitude
            ran off the edge and the place name was squeezed to nothing.

            Each stop is a card now, headed by the day it falls on — counted
            from the nights before it, so adding a rest day renumbers the rest
            without anyone doing arithmetic. */}
        <ul className="space-y-3">
          {stops.map((s, i) => {
            const startDay =
              1 + stops.slice(0, i).reduce((n, x) => n + Math.max(1, Number(x.nights) || 1), 0);
            const nights = Math.max(1, Number(s.nights) || 1);
            const endDay = startDay + nights - 1;
            return (
              <li key={i} className="rounded-card border border-line bg-paper p-3">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="font-mono text-caption font-medium text-ink">
                    {startDay === endDay ? `Day ${startDay}` : `Days ${startDay}–${endDay}`}
                  </p>
                  {stops.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setStops((all) => all.filter((_, j) => j !== i))}
                      className="text-caption text-ember underline"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <label className={label}>
                  Where you sleep
                  <input
                    value={s.place}
                    onChange={(e) => setStop(i, { place: e.target.value })}
                    placeholder="Namche Bazaar"
                    className={field}
                  />
                </label>

                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className={label}>
                    How high (m)
                    <input
                      type="number"
                      inputMode="numeric"
                      value={s.altitude_m}
                      onChange={(e) => setStop(i, { altitude_m: e.target.value })}
                      placeholder="3440"
                      className={field}
                    />
                  </label>
                  <label className={label}>
                    Nights here
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={s.nights}
                      onChange={(e) => setStop(i, { nights: e.target.value })}
                      className={field}
                    />
                  </label>
                </div>

                <label className={`${label} mt-2`}>
                  What happens on this day
                  <textarea
                    value={s.note}
                    onChange={(e) => setStop(i, { note: e.target.value })}
                    rows={2}
                    placeholder="Steep climb through pine forest to the Sherpa capital. Afternoon free to acclimatise."
                    className={field}
                  />
                </label>
              </li>
            );
          })}
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
        {/* Two columns rather than a flex row with fixed widths: `field`
            already carries w-full, so a w-24 beside it lost to Tailwind's own
            ordering and the cost box ate the row. A grid cannot have that
            argument. */}
        <ul className="space-y-2">
          {permits.map((p, i) => (
            <li key={i} className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
              <input
                aria-label={`Permit ${i + 1} name`}
                value={p.name}
                onChange={(e) =>
                  setPermits((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                placeholder="Manaslu restricted-area permit"
                className={`${field} min-w-0`}
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
                className={`${field} min-w-0`}
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
    </Shell>
  );
}
