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
 *
 * Fully controlled. It held its own state once, reading `initial` at mount,
 * which forced the page to delay mounting it until a saved draft had been
 * read — and that meant the server rendered a heading with an empty box under
 * it. On a cheap phone over 3G the picker simply was not there for seconds.
 * The page owns the rows now, so this renders complete on the server.
 */

const field =
  "min-w-0 rounded-button border border-border bg-card px-3 py-2 text-base text-ink outline-none focus:border-primary";

export function GuideLanguages({
  name = "languages",
  value,
  onChange,
}: {
  /** The hidden field the server reads. */
  name?: string;
  value: LanguageRow[];
  onChange: (rows: LanguageRow[]) => void;
}) {
  // A language already claimed is not offered again: the table's primary key
  // is (guide_id, language), so a duplicate would reject the whole insert.
  const taken = new Set(value.map((r) => r.language));
  const spare = LANGUAGES.find((l) => !taken.has(l));

  const set = (i: number, patch: Partial<LanguageRow>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      <ul className="space-y-2">
        {value.map((r, i) => (
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
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
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
          onClick={() => onChange([...value, { language: spare, proficiency: "conversational" }])}
          className="mt-2 text-sm font-medium text-primary hover:underline"
        >
          + Add a language
        </button>
      )}
    </div>
  );
}
