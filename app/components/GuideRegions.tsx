import { REGIONS, REGION_HINTS, type Region } from "~/lib/guide-regions";

/**
 * The parts of Nepal a guide works in.
 *
 * Plain checkboxes on purpose. This is the last thing a guide fills in on a
 * cheap phone at the end of a long form, so it has to render whole on the
 * server and submit with no JavaScript — no hidden JSON, no click handlers.
 * A checkbox group posts as a repeated field name, which the action reads
 * with getAll().
 */
export function GuideRegions({
  name = "regions",
  selected,
}: {
  name?: string;
  /** Already-chosen regions, for the profile editor. */
  selected?: readonly string[];
}) {
  const on = new Set(selected ?? []);
  return (
    <div className="flex flex-wrap gap-2">
      {REGIONS.map((r: Region) => (
        <label
          key={r}
          className="cursor-pointer select-none rounded-full border border-border bg-paper px-3 py-1.5 text-sm text-ink has-[:checked]:border-primary has-[:checked]:bg-mist has-[:checked]:font-medium has-[:checked]:text-primary"
        >
          <input
            type="checkbox"
            name={name}
            value={r}
            defaultChecked={on.has(r)}
            className="sr-only"
          />
          {r}
          {REGION_HINTS[r] && (
            <span className="ml-1 text-xs text-ink-soft">{REGION_HINTS[r]}</span>
          )}
        </label>
      ))}
    </div>
  );
}
