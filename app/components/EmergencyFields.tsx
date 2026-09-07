import { RELATIONSHIPS, type EmergencyRow } from "~/lib/emergency";

/**
 * The four fields, with no <form> of their own.
 *
 * Both places that ask for this already sit inside a form — the trekker's
 * documents card and the guide's application — so this is fields only and the
 * caller owns the submit. Same names on both sides, which is what lets one
 * parser serve both.
 */

const field =
  "mt-1 w-full rounded-button border border-border bg-card px-3 py-2 text-base text-ink outline-none focus:border-primary";

export function EmergencyFields({
  defaults,
  /** "you" for the guide's own contact, "them" for a trekker's. */
  phoneHint = "With the country code, like +44 or +49.",
}: {
  defaults?: EmergencyRow | null;
  phoneHint?: string;
}) {
  const rel = defaults?.emergency_contact_relationship ?? "";
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm text-ink">Their name</span>
        <input
          name="emergency_contact_name"
          defaultValue={defaults?.emergency_contact_name ?? ""}
          autoComplete="off"
          required
          className={field}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-ink">Who they are</span>
          <select
            name="emergency_contact_relationship"
            defaultValue={rel}
            className={`${field} min-w-0`}
          >
            <option value="">—</option>
            {RELATIONSHIPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            {/* A saved answer from before this list existed still shows. */}
            {rel && !RELATIONSHIPS.includes(rel as any) && <option value={rel}>{rel}</option>}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-ink">Their phone</span>
          <input
            name="emergency_contact_phone"
            type="tel"
            inputMode="tel"
            defaultValue={defaults?.emergency_contact_phone ?? ""}
            placeholder="+…"
            required
            className={`${field} min-w-0`}
          />
        </label>
      </div>
      <p className="-mt-1 text-xs text-ink-soft">{phoneHint}</p>

      <label className="block">
        <span className="text-sm text-ink">
          Their email
          <span className="ml-1.5 text-xs text-ink-soft">optional</span>
        </span>
        <input
          name="emergency_contact_email"
          type="email"
          defaultValue={defaults?.emergency_contact_email ?? ""}
          className={field}
        />
      </label>
    </div>
  );
}
