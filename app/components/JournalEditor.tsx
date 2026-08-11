import { Form } from "react-router";
import { Button } from "~/components/Button";
import { PhotoUpload } from "~/components/PhotoUpload";
import {
  TAG_KIND_ORDER,
  TAG_VOCAB,
  type JournalEntry,
  type JournalTag,
} from "~/lib/journals";

/**
 * The journal editor, shared by /ops/journals/:id and /g/journals/:id.
 *
 * Built for a guide on a cheap Android on 3G: plain inputs, one thing per
 * screen-width, no drag-and-drop, no rich text. Every field is a normal form
 * POST so a dropped connection loses one block, not the whole trek.
 */

const input =
  "mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss";
const label = "block text-sm text-ink-soft";

export function JournalMetaForm({
  journal,
  routes,
  bookings,
  tags,
  canPublish,
  busy,
}: {
  journal: any;
  routes: { id: string; name: string }[];
  bookings?: { id: string; start_date: string; offering: any }[];
  tags?: JournalTag[];
  /** Ops only — a guide writes and submits, ops publishes. */
  canPublish?: boolean;
  busy?: boolean;
}) {
  return (
    <Form method="post" className="space-y-4 rounded-md border border-line bg-card p-4">
      <input type="hidden" name="intent" value="meta" />

      <label className={label}>
        Title — say what it was, not what it felt like
        <input
          name="title"
          defaultValue={journal?.title ?? ""}
          placeholder="Manaslu in late October, with two brothers from Belgium"
          className={input}
          required
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Started
          <input type="date" name="start_date" defaultValue={journal?.start_date ?? ""} className={input} required />
        </label>
        <label className={label}>
          Finished
          <input type="date" name="end_date" defaultValue={journal?.end_date ?? ""} className={input} required />
        </label>
      </div>

      {/* Required. The route is the spine: it is how this journal reaches the
          route page, the guide's trek count, and /journals?route=… */}
      <label className={label}>
        Route
        <select
          name="route_id"
          defaultValue={journal?.route_id ?? ""}
          className={input}
          required
        >
          <option value="" disabled>
            — pick the route —
          </option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </label>

      {/* Real trips only. One of these two must be answered — the database
          enforces it as well, but this is where a person can understand it. */}
      {bookings && (
        <fieldset className="rounded border border-line p-3">
          <legend className="px-1 text-sm font-medium text-ink">Which trek was this?</legend>
          <label className={label}>
            A booking on Trek
            <select name="booking_id" defaultValue={journal?.booking_id ?? ""} className={input}>
              <option value="">— not a Trek booking —</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.start_date} · {b.offering?.title ?? "trek"}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              name="pre_platform"
              defaultChecked={journal?.pre_platform ?? false}
              className="mt-1 accent-moss"
            />
            <span>
              This was before Trek — ops has checked it happened.
              <span className="block text-caption text-muted">
                Journals must be real treks. No samples, no composites.
              </span>
            </span>
          </label>
          <input
            name="pre_platform_note"
            defaultValue={journal?.pre_platform_note ?? ""}
            placeholder="How we verified it (agency, permit no., client contact)"
            className={input}
          />
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          Highest point (m)
          <input type="number" name="max_altitude_m" defaultValue={journal?.max_altitude_m ?? ""} className={input} />
        </label>
        <label className={label}>
          Distance (km)
          <input type="number" step="0.1" name="distance_km" defaultValue={journal?.distance_km ?? ""} className={input} />
        </label>
        <label className={label}>
          Pass crossed
          <input name="pass_crossed" defaultValue={journal?.pass_crossed ?? ""} className={input} />
        </label>
      </div>

      <label className={label}>
        Weather, one line
        <input
          name="weather_note"
          defaultValue={journal?.weather_note ?? ""}
          placeholder="Snow on the pass on day 9."
          className={input}
        />
      </label>

      <label className={label}>
        Cover photo URL
        <input name="cover_photo_url" defaultValue={journal?.cover_photo_url ?? ""} className={input} />
      </label>

      <label className={label}>
        Your closing note — the last thing they read. Your own words.
        <textarea
          name="guide_note"
          rows={4}
          defaultValue={journal?.guide_note ?? ""}
          placeholder="Jef was scared on the bridge. By day 10 he crossed first. This is why I do this work."
          className={input}
        />
      </label>

      {/* Consent. Both boxes gate what the public view will even return. */}
      <fieldset className="rounded border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink">The people on the trek</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Their names, as they agreed
            <input
              name="group_label"
              defaultValue={journal?.group_label ?? ""}
              placeholder="Jef &amp; Simon, BE"
              className={input}
            />
          </label>
          <label className={label}>
            If they said no — the anonymous version
            <input
              name="group_anon"
              defaultValue={journal?.group_anon ?? ""}
              placeholder="two guests from Belgium"
              className={input}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="client_names_ok" defaultChecked={journal?.client_names_ok} className="accent-moss" />
          They agreed we can use their first names
        </label>
        <label className="mt-1.5 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="client_photos_ok" defaultChecked={journal?.client_photos_ok} className="accent-moss" />
          They agreed we can show photos they are in
        </label>
        <p className="mt-2 text-caption text-muted">
          Unticked is not a blocker — the journal publishes with the anonymous
          label, and photos marked “someone is in this” are hidden automatically.
        </p>
      </fieldset>

      {/* Tags. A closed list on purpose — see TAG_VOCAB. Each one becomes a
          clickable filter on the journal, so a wrong tag is a wrong page. */}
      <fieldset className="rounded border border-line p-3">
        <legend className="px-1 text-sm font-medium text-ink">Tags</legend>
        <p className="text-caption text-muted">
          Tick what was true. These are how someone finds this trek — “snow”,
          “first-timer”, “turned back”.
        </p>
        <div className="mt-3 space-y-3">
          {TAG_KIND_ORDER.map((kind) => (
            <div key={kind}>
              <p className="text-sm text-ink-soft">{TAG_VOCAB[kind].label}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-2">
                {TAG_VOCAB[kind].values.map((v) => (
                  <label key={v} className="flex items-center gap-1.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      name="tag"
                      value={`${kind}:${v}`}
                      defaultChecked={tags?.some((t) => t.kind === kind && t.value === v)}
                      className="accent-moss"
                    />
                    {v}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          A note from the client, if they sent one
          <textarea name="client_note" rows={2} defaultValue={journal?.client_note ?? ""} className={input} />
        </label>
        <label className={label}>
          Who said it
          <input name="client_note_author" defaultValue={journal?.client_note_author ?? ""} placeholder="Jef, BE" className={input} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" loading={busy}>
          Save
        </Button>
        {canPublish && (
          <>
            <button
              name="intent"
              value="publish"
              className="rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
            >
              Publish
            </button>
            {journal?.status === "published" && (
              <button
                name="intent"
                value="unpublish"
                className="rounded border border-line px-4 py-2 text-sm text-ink hover:bg-mist"
              >
                Unpublish
              </button>
            )}
          </>
        )}
      </div>
    </Form>
  );
}

export function EntryForm({
  entry,
  nextDay,
  guideId,
}: {
  entry?: JournalEntry;
  nextDay: number;
  guideId?: string;
}) {
  const areaId = `photos-${entry?.id ?? "new"}`;
  return (
    <Form method="post" className="space-y-3 rounded-md border border-line bg-card p-4">
      <input type="hidden" name="intent" value="entry" />
      {entry && <input type="hidden" name="entry_id" value={entry.id} />}

      <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
        <label className={label}>
          Day
          <input
            type="number"
            name="day_no"
            min={1}
            defaultValue={entry?.day_no ?? nextDay}
            className={input}
            required
          />
        </label>
        <label className={label}>
          What happened — a few words
          <input
            name="title"
            defaultValue={entry?.title ?? ""}
            placeholder="Up to Samagaon, and the yaks came past"
            className={input}
            required
          />
        </label>
      </div>

      <label className={label}>
        Tell it. Two to five sentences, the way you would say it.
        <textarea name="body" rows={4} defaultValue={entry?.body ?? ""} className={input} />
      </label>

      <label className={label}>
        Altitude that night (m)
        <input
          type="number"
          name="altitude_m"
          defaultValue={entry?.altitude_m ?? ""}
          className={input + " sm:max-w-xs"}
        />
      </label>

      <PhotoUpload targetId={areaId} guideId={guideId} />

      <label className={label}>
        Photos and video on this day — one link per line
        <textarea
          id={areaId}
          name="photo_urls"
          rows={3}
          defaultValue={(entry?.photos ?? []).map((p) => p.url).join("\n")}
          className={input}
        />
      </label>
      <p className="text-caption text-muted">
        Tick the number of any photo a client is recognisable in — those hide
        themselves if the client did not agree to photos.
      </p>
      <div className="flex flex-wrap gap-3">
        {[0, 1, 2, 3].map((i) => (
          <label key={i} className="flex items-center gap-1.5 text-sm text-ink">
            <input
              type="checkbox"
              name="photo_people"
              value={String(i)}
              defaultChecked={entry?.photos?.[i]?.people ?? false}
              className="accent-moss"
            />
            photo {i + 1}
          </label>
        ))}
      </div>

      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="is_hard_day"
          defaultChecked={entry?.is_hard_day ?? false}
          className="mt-1 accent-moss"
        />
        <span>
          This was the hard day
          <span className="block text-caption text-muted">
            Weather hold, someone sick, a turn-back. It gets its own block — we
            do not hide these.
          </span>
        </span>
      </label>

      <div className="flex gap-3">
        <Button type="submit" size="sm">
          {entry ? "Save day" : "Add day"}
        </Button>
        {entry && (
          <button
            name="intent"
            value="delete_entry"
            className="rounded border border-line px-3 py-2 text-sm text-ember hover:bg-mist"
          >
            Delete
          </button>
        )}
      </div>
    </Form>
  );
}
