import { Form } from "react-router";

/**
 * The hero search: where · when · how many. A plain GET to /experiences, which
 * means it works with JavaScript off and every result is a shareable URL.
 *
 * This is the primary action on the homepage. The old hero offered "match me"
 * and "meet our guides" — both fine, neither is what someone with a fortnight
 * in October actually wants to do first.
 */
export function HeroSearch({
  today,
  regions,
}: {
  today: string;
  /** Datalist suggestions — real route and region names from the database. */
  regions: string[];
}) {
  const field = "w-full bg-transparent text-base text-ink outline-none placeholder:text-muted";
  const cell = "flex flex-col gap-0.5 px-4 py-3";
  const label = "text-[11px] font-semibold uppercase tracking-wide text-muted";

  return (
    <Form
      method="get"
      action="/experiences"
      className="w-full max-w-3xl rounded-md bg-paper/95 shadow-lift backdrop-blur sm:rounded-full"
    >
      <div className="flex flex-col divide-y divide-line sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0">
        <div className={`${cell} sm:flex-[1.4]`}>
          <label className={label} htmlFor="hero-where">
            Where
          </label>
          <input
            id="hero-where"
            name="q"
            list="hero-regions"
            placeholder="Everest, Annapurna, Pokhara…"
            className={field}
          />
          <datalist id="hero-regions">
            {regions.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        {/* One date, not two. Somebody at the top of the homepage knows
            roughly when they are setting off; they do not yet know how long
            the trek is, because that is what the trek decides. Asking for a
            return date made them invent one — and two bare dd/mm/yyyy fields
            side by side was the busiest thing in the hero. */}
        <div className={`${cell} sm:flex-1`}>
          <label className={label} htmlFor="hero-from">
            Setting off
          </label>
          <input
            id="hero-from"
            type="date"
            name="from"
            min={today}
            className={`${field} font-mono text-sm`}
          />
        </div>

        <div className={`${cell} sm:w-36`}>
          <label className={label} htmlFor="hero-party">
            How many
          </label>
          <select id="hero-party" name="party" defaultValue="2" className={`${field} font-mono`}>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "person" : "people"}
              </option>
            ))}
          </select>
        </div>

        <div className="p-2 sm:flex sm:items-center sm:pr-2">
          <button className="w-full rounded bg-pine px-6 py-3 font-medium text-paper transition-colors hover:bg-moss sm:rounded-full sm:py-3.5">
            Search
          </button>
        </div>
      </div>
    </Form>
  );
}
