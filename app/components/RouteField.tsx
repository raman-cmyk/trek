import { useId, useState } from "react";
import { groupByRegion } from "~/lib/route-cards";

export interface PickableRoute {
  id: string;
  name: string;
  region?: string | null;
}

/**
 * Pick one trail out of the catalogue, by typing.
 *
 * Shared by the application form and the guide's own profile, which each had
 * their own flat A–Z `<select>` over twenty-four routes with the region
 * fetched and never rendered — so Everest Base Camp, Everest Three Passes and
 * Everest View sat apart from Gokyo Lakes with nothing connecting them, and a
 * guide had to already know our name for their own trek.
 *
 * **Five guides out of fifty-six had filled this in**, for the field both
 * screens call the first thing a trekker reads. That is the reason this
 * exists.
 *
 * A native `<datalist>` rather than a hand-rolled combobox, for the reasons
 * `DistrictPicker` already sets out about the seventy-seven districts: it is
 * the Android keyboard's own filter, it works with no JavaScript, it costs
 * nothing on a slow connection, and typing "eve" brings the Everest routes
 * together. Grouped with `groupByRegion` so the order matches `/routes`.
 *
 * The two screens save differently on purpose — the application holds its
 * rows until the form is sent because there is no account yet, while the
 * profile posts each row as it is added. So this shares the picker and not
 * the saving: it reports the matched route upward AND writes a hidden field,
 * which is what lets it sit inside a plain `<Form method="post">`.
 */
export function RouteField({
  routes,
  name = "route_id",
  label = "Trail",
  value,
  onChange,
  required,
  className,
}: {
  /** Only the ones still available — a route already claimed is not offered. */
  routes: PickableRoute[];
  name?: string;
  label?: string;
  /** Controlled text, when the parent wants it (the application does). */
  value?: string;
  onChange?: (typed: string, matched: PickableRoute | null) => void;
  required?: boolean;
  className?: string;
}) {
  const listId = useId();
  const [own, setOwn] = useState("");
  const typed = value ?? own;

  // Busiest region first, alphabetical within it — the same shelves as
  // /routes. A route with no region falls under "Elsewhere in Nepal".
  const shelves = groupByRegion(routes.map((r) => ({ ...r, region: r.region ?? "" })));

  // The datalist hands back a NAME, so matching is by name — folded for case
  // and stray spaces, because a guide typing on a phone keyboard should not
  // lose their trail to a capital letter.
  const matched = routes.find((r) => fold(r.name) === fold(typed)) ?? null;
  const unknown = fold(typed).length > 2 && !matched;

  const set = (next: string) => {
    if (value === undefined) setOwn(next);
    onChange?.(next, routes.find((r) => fold(r.name) === fold(next)) ?? null);
  };

  return (
    <div className={className}>
      <label className="block text-sm text-ink-soft">
        {label}
        <input
          list={listId}
          value={typed}
          onChange={(e) => set(e.target.value)}
          autoComplete="off"
          required={required}
          placeholder="Start typing — Everest, Manaslu…"
          aria-label="Which trail have you walked"
          className="mt-1 w-full rounded-button border border-border bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss"
        />
      </label>
      {/* What the form actually posts. Empty until the typed text matches a
          real route, so a half-typed name cannot reach the server as an id. */}
      <input type="hidden" name={name} value={matched?.id ?? ""} />
      <datalist id={listId}>
        {shelves.map((shelf) => (
          <optgroup
            key={shelf.region}
            label={shelf.note ? `${shelf.region} — ${shelf.note}` : shelf.region}
          >
            {shelf.routes.map((r) => (
              <option key={r.id} value={r.name} />
            ))}
          </optgroup>
        ))}
      </datalist>
      {unknown && (
        <p className="mt-1.5 text-sm text-ember">
          We do not list a trail called “{typed.trim()}”. Try a shorter word.
        </p>
      )}
    </div>
  );
}

function fold(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}
