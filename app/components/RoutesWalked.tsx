import { useState } from "react";
import { MAX_TIMES_WALKED } from "~/lib/guide-routes";
import { RouteField, type PickableRoute } from "~/components/RouteField";

/**
 * Which trails a guide has walked, and how many times.
 *
 * This is the line a trekker reads first — "Manaslu ×34" is the whole
 * argument for choosing one person over another, and it is the thing an
 * agency cannot show you. The profile editor has asked for it since 0049;
 * the application, where the office decides whether to verify somebody at
 * all, never did.
 *
 * Built for the application, so it holds its list in one hidden field and
 * saves nothing until the form is sent — there is no account to save against
 * yet. Whole rows go in and out at once: a half-typed row cannot be submitted,
 * which is what stops "Manaslu, ? times" reaching the office.
 *
 * You TYPE the trail now. It was a flat A-Z `<select>` over twenty-four
 * routes, with the region fetched from the database and never rendered — so
 * Everest Base Camp, Everest Three Passes and Everest View sat apart from
 * Gokyo Lakes with nothing connecting them, and a guide had to know our name
 * for their own trek. **Five guides out of fifty-six had filled this in**,
 * for the field the form itself calls the first thing a trekker reads.
 *
 * A native `<datalist>`, grouped by region, for the reasons `DistrictPicker`
 * already gives about the seventy-seven districts two fields further down:
 * it is the Android keyboard's own filter, it needs no JavaScript to be
 * usable, it costs nothing on a slow connection, and a guide can type "eve"
 * and see the three Everest routes together. A hand-rolled listbox would look
 * better on a laptop and be worse on the phone this page is for.
 */

export interface WalkedRoute {
  routeId: string;
  times: number;
}

export function RoutesWalked({
  routes,
  name = "routes_walked",
  initial = [],
}: {
  routes: Array<{ id: string; name: string; region?: string | null }>;
  name?: string;
  initial?: WalkedRoute[];
}) {
  const [rows, setRows] = useState<WalkedRoute[]>(initial);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<PickableRoute | null>(null);
  const [times, setTimes] = useState("");

  const nameOf = (id: string) => routes.find((r) => r.id === id)?.name ?? "That route";
  const left = routes.filter((r) => !rows.some((w) => w.routeId === r.id));

  const n = Math.round(Number(times));
  const canAdd = !!picked && Number.isFinite(n) && n >= 1;

  const add = () => {
    if (!picked || !canAdd) return;
    setRows((all) => [...all, { routeId: picked.id, times: Math.min(MAX_TIMES_WALKED, n) }]);
    setTyped("");
    setPicked(null);
    setTimes("");
  };

  const field =
    "mt-1 w-full rounded-button border border-border bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss";

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />

      {rows.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {rows.map((w) => (
            <li
              key={w.routeId}
              className="flex items-center justify-between gap-3 rounded-button border border-border bg-paper px-3 py-2"
            >
              <span className="min-w-0 truncate text-sm text-ink">{nameOf(w.routeId)}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="font-mono text-sm text-ink">×{w.times}</span>
                <button
                  type="button"
                  onClick={() => setRows((all) => all.filter((x) => x.routeId !== w.routeId))}
                  className="text-caption text-ember"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-[1fr_5.5rem_auto] items-end gap-2">
        {/* No `name`: the application posts its whole list as one hidden
            JSON field below, not a route id per row. */}
        <RouteField
          routes={left}
          name=""
          value={typed}
          onChange={(next, match) => {
            setTyped(next);
            setPicked(match);
          }}
        />
        <label className="block text-sm text-ink-soft">
          Times
          <input
            type="number"
            min={1}
            max={MAX_TIMES_WALKED}
            value={times}
            onChange={(e) => setTimes(e.target.value)}
            onKeyDown={(e) => {
              // Enter here adds the row rather than submitting the whole
              // application half-filled.
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={field}
            aria-label="How many times have you walked it"
          />
        </label>
        <button
          type="button"
          onClick={add}
          disabled={!canAdd}
          className="rounded-button border border-moss px-4 py-2.5 text-sm font-medium text-moss disabled:opacity-40"
        >
          Add
        </button>
      </div>

      <p className="mt-2 text-caption text-muted">
        {rows.length === 0
          ? "Start with the one you have led most. This is the first thing a trekker reads."
          : "Add as many as you like. The office checks them before they show as confirmed."}
      </p>
    </div>
  );
}
