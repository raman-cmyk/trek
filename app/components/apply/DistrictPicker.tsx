import { DISTRICT_COUNT, districtsByProvince, isDistrict } from "~/lib/districts";

/**
 * Home district, from the seventy-seven.
 *
 * A native `<datalist>` rather than a hand-rolled combobox, deliberately: it
 * is the Android keyboard's own filter, it needs no JavaScript to be usable,
 * it costs nothing on a slow connection, and it still lets a guide type
 * "solu" and pick. A custom listbox would look better on a laptop and be
 * worse on the device this page is actually for.
 *
 * Grouped by province so the neighbours are together, and validated on the
 * way out — the field was free text, which produced four spellings of
 * Solukhumbu and made grouping guides by where they are from impossible.
 */
export function DistrictPicker({
  name = "home_district",
  value,
  onChange,
  label,
  hint,
  problem,
}: {
  name?: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
  hint?: string;
  problem?: string | null;
}) {
  const listId = `${name}-districts`;
  const typed = value.trim();
  const unknown = typed.length > 1 && !isDistrict(typed);

  return (
    <div>
      <label htmlFor={name} className="text-ink">{label}</label>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <input
        id={name}
        name={name}
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        placeholder="Solukhumbu"
        className="mt-2 h-[52px] w-full rounded-xl border border-line bg-card px-3 text-ink placeholder:text-muted/60 focus:border-moss focus:outline-none focus:ring-2 focus:ring-moss/30"
      />
      <datalist id={listId}>
        {districtsByProvince().map((g) => (
          <optgroup key={g.province} label={g.province}>
            {g.districts.map((d) => (
              <option key={d} value={d} />
            ))}
          </optgroup>
        ))}
      </datalist>
      {unknown && !problem && (
        <p className="mt-1.5 text-sm text-ember">
          We do not know that district — pick one of the {DISTRICT_COUNT} from the list.
        </p>
      )}
      {problem && <p className="mt-1.5 text-sm text-ember">{problem}</p>}
    </div>
  );
}
