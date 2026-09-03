import { useEffect, useState } from "react";
import {
  LANGUAGES,
  PROFICIENCIES,
  PROFICIENCY_LABELS,
  type LanguageRow,
} from "~/lib/guide-languages";

/**
 * The languages a guide speaks, and how well.
 *
 * This replaces a text box that said "separate them with commas". That box
 * produced rows nobody could filter on and every language was stored as
 * "conversational" regardless of what the guide meant — which is why the
 * matcher's "speaks it fluently" branch has never once fired. A guide who is
 * a native Sherpa speaker and has enough German to run a teahouse can now say
 * exactly that, and it is the thing a German trekker searches on.
 */

const field =
  "min-w-0 rounded-button border border-border bg-card px-3 py-2 text-base text-ink outline-none focus:border-primary";

export function GuideLanguages({
  name = "languages",
  initial,
  onChange,
}: {
  /** The hidden field the server reads. */
  name?: string;
  initial?: LanguageRow[];
  /** So a parent can autosave the draft without owning the list. */
  onChange?: (rows: LanguageRow[]) => void;
}) {
  const [rows, setRows] = useState<LanguageRow[]>(
    initial?.length ? initial : [{ language: "Nepali", proficiency: "native" }],
  );

  useEffect(() => onChange?.(rows), [rows, onChange]);

  // A language already claimed is not offered again: the table's primary key
  // is (guide_id, language), so a duplicate would reject the whole insert.
  const taken = new Set(rows.map((r) => r.language));
  const spare = LANGUAGES.find((l) => !taken.has(l));

  const set = (i: number, patch: Partial<LanguageRow>) =>
    setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.language} className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Language"
              value={r.language}
              onChange={(e) => set(i, { language: e.target.value as any })}
              className={`${field} flex-1 basis-32`}
            >
              {LANGUAGES.filter((l) => l === r.language || !taken.has(l)).map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              aria-label={`How well you speak ${r.language}`}
              value={r.proficiency}
              onChange={(e) => set(i, { proficiency: e.target.value as any })}
              className={`${field} flex-1 basis-36`}
            >
              {PROFICIENCIES.map((p) => (
                <option key={p} value={p}>
                  {PROFICIENCY_LABELS[p]}
                </option>
              ))}
            </select>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                className="shrink-0 px-1 text-sm text-ink-soft hover:text-danger"
                aria-label={`Remove ${r.language}`}
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      {spare && (
        <button
          type="button"
          onClick={() =>
            setRows((all) => [...all, { language: spare, proficiency: "conversational" }])
          }
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          + Add a language
        </button>
      )}
    </div>
  );
}
