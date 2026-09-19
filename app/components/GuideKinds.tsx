import { OFFERING_KINDS, OFFERING_KIND_PLURAL } from "~/lib/offering-kinds";

/**
 * What a guide will take people on.
 *
 * Asked before the licence step, because it decides which licence that step
 * asks for. A momo-crawl host has no reason to hold a trekking card; a
 * heritage walk through Pashupatinath needs a tour guide licence, which is a
 * different card entirely. The form used to demand the trekking one from
 * everybody.
 *
 * Same chips-on-hidden-checkboxes pattern as `GuideRegions`, so it renders on
 * the server and submits with no JavaScript.
 */
export function GuideKinds({
  name = "guide_kinds",
  selected,
  labels,
}: {
  name?: string;
  selected?: readonly string[];
  /** Translated labels, keyed by kind. Falls back to the English plural. */
  labels?: Record<string, string>;
}) {
  const on = new Set(selected ?? []);
  return (
    <div className="flex flex-wrap gap-2">
      {OFFERING_KINDS.map((k) => (
        <label
          key={k}
          className="cursor-pointer select-none rounded-full border border-line bg-paper px-3.5 py-2 text-sm text-ink transition-colors has-[:checked]:border-moss has-[:checked]:bg-mist has-[:checked]:font-medium has-[:checked]:text-pine"
        >
          <input
            type="checkbox"
            name={name}
            value={k}
            defaultChecked={on.has(k)}
            className="sr-only"
          />
          {labels?.[k] ?? OFFERING_KIND_PLURAL[k]}
        </label>
      ))}
    </div>
  );
}
