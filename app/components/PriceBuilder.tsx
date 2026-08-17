import { useState } from "react";
import {
  COMPONENT_LIBRARY,
  computeExperiencePricing,
  type PriceBreakdown,
  type PriceBucket,
  type PriceLine,
} from "~/lib/experience-pricing";
import { formatUsd } from "~/lib/pricing";

/**
 * The price, built line by line.
 *
 * Four fixed boxes could not hold both a fourteen-day Manaslu trek and a
 * three-hour momo walk. A guide now picks the components their trip actually
 * has, from a library that changes with the trip type, and adds their own for
 * anything we did not think of.
 *
 * The calculator is the point. A guide was doing this arithmetic in their head
 * — our ten percent, the three percent Fund, the guide fee split across a
 * group, the food multiplied by the days — and getting it wrong is how you
 * either work for nothing or price yourself out. It recomputes on every
 * keystroke and shows the answer at four group sizes, because how a price
 * behaves as the group grows is the thing guides most often get wrong.
 */

// No width here: these sit in a flex row and the widths are set per input.
// `w-full` in this string silently beat the `w-24` on the amount box and
// squeezed the label input to nothing.
const field =
  "min-w-0 rounded border border-line bg-paper px-2.5 py-2 text-base text-ink outline-none focus:border-moss";

export interface DraftLine {
  id: string;
  label: string;
  amountUsd: string;
  basis: "person" | "group";
  cadence: "day" | "trip";
  optional: boolean;
  bucket: PriceBucket;
}

/** Existing breakdown → editable draft lines. */
export function toDraft(bd: PriceBreakdown | null | undefined): DraftLine[] {
  if (bd?.lines?.length) {
    return bd.lines.map((l) => ({
      id: l.id,
      label: l.label,
      amountUsd: (l.amountUsdCents / 100).toString(),
      basis: l.basis,
      cadence: l.cadence,
      optional: l.optional,
      bucket: l.bucket,
    }));
  }
  // An offering priced before the builder existed opens as the four lines it
  // always had, so editing it is continuous rather than a migration the guide
  // has to perform.
  if (!bd) return [];
  const seed: Array<[string, number, DraftLine["basis"], PriceBucket]> = [
    ["Guide fee", bd.guide_fee_total_usd_cents, "group", "guide"],
    ["Permits", bd.permits_usd_cents, "person", "permits"],
    ["Porters", bd.porters_usd_cents, "person", "porters"],
    ["Teahouse & food", bd.logistics_usd_cents, "person", "logistics"],
  ];
  return seed
    .filter(([, cents]) => cents > 0)
    .map(([labelText, cents, basis, bucket], i) => ({
      id: `seed${i}`,
      label: labelText,
      amountUsd: (cents / 100).toString(),
      basis,
      cadence: "trip" as const,
      optional: false,
      bucket,
    }));
}

const toBreakdown = (lines: DraftLine[], days: number): PriceBreakdown => ({
  guide_fee_total_usd_cents: 0,
  permits_usd_cents: 0,
  porters_usd_cents: 0,
  logistics_usd_cents: 0,
  trek_pct: 0.1,
  fund_pct: 0.03,
  days,
  lines: lines.map(
    (l): PriceLine => ({
      id: l.id,
      label: l.label || "Untitled",
      amountUsdCents: Math.max(0, Math.round((Number(l.amountUsd) || 0) * 100)),
      basis: l.basis,
      cadence: l.cadence,
      optional: l.optional,
      bucket: l.bucket,
    }),
  ),
});

export function PriceBuilder({
  kind,
  days,
  initial,
}: {
  kind: string;
  days: number;
  initial: DraftLine[];
}) {
  const [lines, setLines] = useState<DraftLine[]>(initial);
  const [group, setGroup] = useState(2);

  const bd = toBreakdown(lines, days);
  const at = (g: number) => computeExperiencePricing(bd, g).perPersonUsdCents;
  const quote = computeExperiencePricing(bd, group);
  const own = quote.lines.filter((l) => l.key.startsWith("line:"));
  // What the guide keeps: every line that is theirs to be paid for, for the
  // whole party. Our percentages are not theirs and are not counted here.
  const guideEarns =
    lines
      .filter((l) => !l.optional && l.bucket === "guide")
      .reduce(
        (s, l) =>
          s +
          Math.round((Number(l.amountUsd) || 0) * 100) *
            (l.cadence === "day" ? Math.max(1, days) : 1) *
            (l.basis === "person" ? group : 1),
        0,
      );

  const set = (id: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = (l: Omit<DraftLine, "id">) =>
    setLines((ls) => [...ls, { ...l, id: `l${ls.length}-${l.label.slice(0, 8)}` }]);

  const library = COMPONENT_LIBRARY[kind] ?? COMPONENT_LIBRARY.day_hike;
  const unused = library.filter((c) => !lines.some((l) => l.label === c.label));

  return (
    <fieldset className="rounded-md border border-line bg-card p-4">
      <legend className="px-1 text-sm font-medium text-ink">The price, line by line</legend>
      {/* The whole draft travels as one JSON field: the rows are dynamic, and
          a fixed set of named inputs is exactly what we are getting away from. */}
      <input type="hidden" name="price_lines" value={JSON.stringify(lines)} />

      {lines.length === 0 && (
        <p className="text-sm text-ink-soft">
          Add what this trip actually costs you. Tap a line below to start.
        </p>
      )}

      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.id} className="rounded border border-line bg-paper p-2.5">
            <div className="flex gap-2">
              <input
                aria-label="What the line is"
                value={l.label}
                onChange={(e) => set(l.id, { label: e.target.value })}
                className={`${field} min-w-0 flex-1`}
              />
              <input
                aria-label="Amount in dollars"
                type="number"
                step="0.01"
                min={0}
                inputMode="decimal"
                value={l.amountUsd}
                onChange={(e) => set(l.id, { amountUsd: e.target.value })}
                className={`${field} w-24 shrink-0`}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-caption">
              <Toggle
                on={l.basis === "person"}
                onClick={() => set(l.id, { basis: l.basis === "person" ? "group" : "person" })}
                a="each person"
                b="whole group"
              />
              <Toggle
                on={l.cadence === "day"}
                onClick={() => set(l.id, { cadence: l.cadence === "day" ? "trip" : "day" })}
                a="per day"
                b="one-off"
              />
              <Toggle
                on={!l.optional}
                onClick={() => set(l.id, { optional: !l.optional })}
                a="included"
                b="optional extra"
              />
              <button
                type="button"
                onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}
                className="ml-auto text-ember underline underline-offset-2"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {unused.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {unused.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={() => add({ ...c, amountUsd: "" })}
              className="rounded-full border border-line bg-paper px-3 py-1.5 text-caption text-ink hover:border-sage hover:bg-mist"
            >
              + {c.label}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          add({
            label: "",
            amountUsd: "",
            basis: "person",
            cadence: "trip",
            optional: false,
            bucket: "logistics",
          })
        }
        className="mt-2 text-caption text-moss underline underline-offset-4"
      >
        + Add your own line
      </button>

      {/* ── The calculator. ─────────────────────────────────────────────── */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink">What a trekker pays</p>
          <label className="text-caption text-muted">
            Group of{" "}
            <input
              type="range"
              min={1}
              max={12}
              value={group}
              onChange={(e) => setGroup(Number(e.target.value))}
              className="ml-1 w-24 align-middle"
              aria-label="Group size"
            />{" "}
            <span className="font-mono text-ink">{group}</span>
          </label>
        </div>

        <dl className="mt-2 space-y-1 text-sm">
          {own.map((l) => (
            <div key={l.key} className="flex justify-between gap-3">
              <dt className="text-ink-soft">{l.label}</dt>
              <dd className="font-mono text-ink">{formatUsd(l.amountUsdCents)}</dd>
            </div>
          ))}
          {quote.lines
            .filter((l) => !l.key.startsWith("line:"))
            .map((l) => (
              <div key={l.key} className="flex justify-between gap-3">
                <dt className="text-muted">{l.label}</dt>
                <dd className="font-mono text-muted">{formatUsd(l.amountUsdCents)}</dd>
              </div>
            ))}
          <div className="flex justify-between gap-3 border-t border-line pt-1.5">
            <dt className="font-medium text-ink">Each person pays</dt>
            <dd className="font-mono font-medium text-ink">
              {formatUsd(quote.perPersonUsdCents)}
            </dd>
          </div>
        </dl>

        <p className="mt-2 text-sm text-ink">
          You keep{" "}
          <span className="font-mono font-medium">{formatUsd(guideEarns)}</span> for the
          trip.
        </p>

        {/* How the price behaves as the group grows — the thing a guide cannot
            see while typing one number at a time. */}
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {[1, 2, 4, 6].map((g) => (
            <div key={g} className="rounded border border-line bg-paper px-1 py-2">
              <p className="font-mono text-caption text-muted">{g} {g === 1 ? "person" : "people"}</p>
              <p className="font-mono text-sm text-ink">{formatUsd(at(g))}</p>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-caption text-muted">
          Each, including our 10% and the 3% Fund. Lines you marked “whole
          group” split as more people join; “each person” lines do not.
        </p>
      </div>
    </fieldset>
  );
}

/** A two-state word switch — a checkbox reads as a question, this reads as a fact. */
function Toggle({
  on,
  onClick,
  a,
  b,
}: {
  on: boolean;
  onClick: () => void;
  a: string;
  b: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-2.5 py-1 ${
        on ? "border-moss bg-mist text-ink" : "border-line bg-paper text-muted"
      }`}
    >
      {on ? a : b}
    </button>
  );
}
