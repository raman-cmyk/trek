import { useRef, useState } from "react";
import { Form, Link } from "react-router";
import { Button } from "~/components/Button";
import { GuideRegions } from "~/components/GuideRegions";
import { formatUsd } from "~/lib/pricing";
import { fmtDate } from "~/lib/format";
import {
  LANGUAGES,
  PROFICIENCIES,
  PROFICIENCY_LABELS,
  type Proficiency,
} from "~/lib/guide-languages";
import { MAX_TIMES_WALKED } from "~/lib/guide-routes";

/**
 * The pieces of a guide's page, one form each.
 *
 * They post to whatever route renders them (the long profile page or a setup
 * step) with an `intent`; both routes hand the form to saveGuideProfile. A
 * section that takes `then="next"` is asking the route to move on after a
 * successful save — the setup steps set it, the profile page does not.
 *
 * Every form works with JavaScript off: plain inputs, real submits, no
 * hidden JSON. Guides fill these in on cheap phones over 3G.
 */

const card = "space-y-3 rounded-card border border-border bg-card p-4";
const field =
  "mt-1 w-full rounded-button border border-border px-3 py-2 text-base text-ink";

type Guide = Record<string, any> | null;

export function PromiseForm({ guide, busy, then }: { guide: Guide; busy: boolean; then?: string }) {
  return (
    <Form method="post" className={card}>
      <input type="hidden" name="intent" value="promise" />
      {then && <input type="hidden" name="then" value={then} />}
      <p className="text-sm font-medium text-ink">Only with me</p>
      <p className="text-sm text-ink-soft">
        One thing a trekker gets with you and with no other guide. Write it the
        way you speak. Short — about ten words.
      </p>
      <textarea
        name="only_with_me"
        aria-label="Only with me promise"
        rows={2}
        maxLength={90}
        defaultValue={guide?.only_with_me ?? ""}
        placeholder="You sleep at my family house in Ghandruk, not teahouse."
        className="w-full rounded-button border border-border px-3 py-2 text-base"
      />
      <div className="text-xs text-ink-soft">
        <p>Good:</p>
        <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
          <li>I know which teahouse at Lobuche has hot water.</li>
          <li>I carry a real camera. You go home with photos.</li>
        </ul>
        <p className="mt-1.5">
          Not good: “Amazing trek”, “Unforgettable experience”. Say the real
          thing you do.
        </p>
      </div>
      <Button type="submit" size="sm" loading={busy}>
        {then ? "Save and continue" : "Save"}
      </Button>
    </Form>
  );
}

export function StoryForm({ guide, busy, then }: { guide: Guide; busy: boolean; then?: string }) {
  return (
    <Form method="post" className={card}>
      <input type="hidden" name="intent" value="story" />
      {then && <input type="hidden" name="then" value={then} />}
      <div>
        <p className="text-sm font-medium text-ink">About you</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          This is the longest thing a trekker reads about you. Where you are
          from, how you walk, what you care about. Your words, not ours.
        </p>
      </div>
      <label className="block text-sm text-ink-soft">
        Short line under your name
        <input
          name="hook_line"
          maxLength={120}
          defaultValue={guide?.hook_line ?? ""}
          placeholder="Knows every teahouse from Lukla to Gorak Shep"
          className={field}
        />
      </label>
      <label className="block text-sm text-ink-soft">
        Your story
        <textarea
          name="bio"
          rows={7}
          maxLength={4000}
          defaultValue={guide?.bio ?? ""}
          placeholder="I grew up in Khumjung, an hour below Everest View Hotel…"
          className={field}
        />
      </label>
      <Button type="submit" size="sm" loading={busy}>
        {then ? "Save and continue" : "Save"}
      </Button>
    </Form>
  );
}

export function LanguagesEditor({
  languages,
  busy,
}: {
  languages: Array<{ language: string; proficiency: string }>;
  busy: boolean;
}) {
  const spoken = new Set(languages.map((l) => l.language));
  return (
    <section className={card}>
      <div>
        <p className="text-sm font-medium text-ink">Languages you speak</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          Trekkers filter by this. Every one you add puts you in another search.
        </p>
      </div>
      {languages.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {languages.map((l) => (
            <li key={l.language}>
              <Form
                method="post"
                className="flex items-center gap-1 rounded-full border border-border bg-paper py-1 pl-3 pr-1 text-sm"
              >
                <input type="hidden" name="intent" value="language" />
                <input type="hidden" name="language" value={l.language} />
                <span className="text-ink">{l.language}</span>
                <span className="text-xs text-ink-soft">
                  {PROFICIENCY_LABELS[l.proficiency as Proficiency] ?? l.proficiency}
                </span>
                <button
                  name="delete"
                  value="1"
                  aria-label={`Remove ${l.language}`}
                  className="ml-0.5 flex size-6 items-center justify-center rounded-full text-ink-soft hover:bg-ember/10 hover:text-ember"
                >
                  ×
                </button>
              </Form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">None yet.</p>
      )}
      <Form method="post" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="intent" value="language" />
        <label className="flex-1 text-sm text-ink-soft">
          Add a language
          <select name="language" required className={field}>
            {LANGUAGES.filter((l) => !spoken.has(l)).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-ink-soft">
          How well
          <select
            name="proficiency"
            defaultValue="conversational"
            className="mt-1 block rounded-button border border-border px-3 py-2 text-base text-ink"
          >
            {PROFICIENCIES.map((p) => (
              <option key={p} value={p}>
                {PROFICIENCY_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="sm" loading={busy}>
          Add
        </Button>
      </Form>
    </section>
  );
}

export function RegionsForm({ guide, busy, then }: { guide: Guide; busy: boolean; then?: string }) {
  return (
    <Form method="post" className={card}>
      <input type="hidden" name="intent" value="regions" />
      {then && <input type="hidden" name="then" value={then} />}
      <div>
        <p className="text-sm font-medium text-ink">Where you work</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          The areas you actually take people to. Your home district says where
          you are from; this says where you guide.
        </p>
      </div>
      <GuideRegions selected={guide?.regions ?? []} />
      <Button type="submit" size="sm" loading={busy}>
        {then ? "Save and continue" : "Save"}
      </Button>
    </Form>
  );
}

export function RoutesEditor({
  walked,
  routes,
  busy,
}: {
  walked: Array<any>;
  routes: Array<{ id: string; name: string; region: string | null }>;
  busy: boolean;
}) {
  const claimed = new Set<string>(walked.map((w) => w.route_id));
  const spare = routes.filter((r) => !claimed.has(r.id));
  return (
    <section className={card}>
      <div>
        <p className="text-sm font-medium text-ink">Routes you have walked</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          And how many times you have led each one. This is the first thing a
          trekker reads on your page.
        </p>
      </div>

      {walked.length > 0 ? (
        <ul className="space-y-2">
          {walked.map((w) => (
            <li key={w.route_id}>
              <Form
                method="post"
                className="flex flex-wrap items-end gap-2 rounded-button border border-border p-3"
              >
                <input type="hidden" name="intent" value="route" />
                <input type="hidden" name="route_id" value={w.route_id} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{w.route?.name ?? "This route"}</p>
                  <p className="text-xs text-ink-soft">
                    {w.route?.region ?? ""}
                    {w.verified_at && <span className="ml-1.5 text-moss">· checked by us</span>}
                  </p>
                </div>
                <label className="text-sm text-ink-soft">
                  Times
                  <input
                    name="times_walked"
                    type="number"
                    min={1}
                    max={MAX_TIMES_WALKED}
                    defaultValue={w.times_walked}
                    className="mt-1 block w-24 rounded-button border border-border px-3 py-2 text-base text-ink"
                  />
                </label>
                <Button type="submit" size="sm" variant="secondary">
                  Save
                </Button>
                <button
                  name="delete"
                  value="1"
                  className="rounded-button px-3 py-2 text-sm text-ember hover:bg-mist"
                >
                  Remove
                </button>
              </Form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">
          None yet. Add the trek you have led most — it is what people book.
        </p>
      )}

      {spare.length > 0 ? (
        <Form
          method="post"
          className="flex flex-wrap items-end gap-2 rounded-button border border-dashed border-border p-3"
        >
          <input type="hidden" name="intent" value="route" />
          <label className="flex-1 text-sm text-ink-soft">
            Add a route
            <select name="route_id" required className={field}>
              {spare.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.region ? ` — ${r.region}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-soft">
            Times
            <input
              name="times_walked"
              type="number"
              min={1}
              max={MAX_TIMES_WALKED}
              defaultValue={1}
              className="mt-1 block w-24 rounded-button border border-border px-3 py-2 text-base text-ink"
            />
          </label>
          <Button type="submit" size="sm" loading={busy}>
            Add
          </Button>
        </Form>
      ) : (
        <p className="text-sm text-ink-soft">
          Every route we list is on your page. Walked one we don't have?{" "}
          <Link to="/g/routes/new" className="text-primary hover:underline">
            Tell us about it
          </Link>
          .
        </p>
      )}

      {walked.some((w) => w.verified_at) && (
        <p className="text-xs text-ink-soft">
          Changing a number our office has checked clears the tick until we
          check it again.
        </p>
      )}
    </section>
  );
}

export function BasicsForm({ guide, busy, then }: { guide: Guide; busy: boolean; then?: string }) {
  return (
    <Form method="post" className={card}>
      <input type="hidden" name="intent" value="basics" />
      {then && <input type="hidden" name="then" value={then} />}
      <p className="text-sm font-medium text-ink">Your details</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm text-ink-soft">
          Home district
          <input name="home_district" defaultValue={guide?.home_district ?? ""} className={field} />
        </label>
        <label className="block text-sm text-ink-soft">
          Years guiding
          <input
            name="years_experience"
            type="number"
            min={0}
            max={70}
            defaultValue={guide?.years_experience ?? ""}
            className={field}
          />
        </label>
        {/* A date input prints its boxes in the browser's locale, so the
            saved value is echoed back in words, where "5 January 2028"
            cannot be read two ways. */}
        <label className="block text-sm text-ink-soft">
          Licence expires
          <input
            name="licence_expiry"
            type="date"
            defaultValue={guide?.licence_expiry ?? ""}
            className={field}
          />
          {guide?.licence_expiry && (
            <span className="mt-1 block text-xs text-ink-soft">
              Saved as {fmtDate(guide.licence_expiry)}
            </span>
          )}
        </label>
        <label className="block text-sm text-ink-soft">
          We should call you
          <select name="gender" defaultValue={guide?.gender ?? ""} className={field}>
            <option value="">Prefer not to say (they)</option>
            <option value="female">She</option>
            <option value="male">He</option>
            <option value="other">They</option>
          </select>
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="porter_welfare"
          defaultChecked={!!guide?.porter_welfare}
          className="mt-0.5 size-4"
        />
        <span>
          I promise fair pay, weight limits, insurance and proper gear for every
          porter on my treks.
          <span className="block text-ink-soft">Shown on your profile.</span>
        </span>
      </label>
      <Button type="submit" size="sm" loading={busy}>
        {then ? "Save and continue" : "Save"}
      </Button>
    </Form>
  );
}

export function HeldByTeam({ guide }: { guide: Guide }) {
  return (
    <section className="space-y-1 rounded-card border border-border bg-card p-4 text-sm">
      <p className="mb-2 text-sm font-medium text-ink">Held by our team</p>
      <Row label="Licence no." value={guide?.licence_no} />
      <Row label="Status" value={guide?.status} />
      <Row label="Tier" value={`${guide?.tier ?? 0}`} />
      <Row
        label="Current day rate"
        value={guide?.day_rate_usd_cents ? formatUsd(guide.day_rate_usd_cents) : "—"}
      />
      <p className="pt-2 text-ink-soft">
        These we check and set ourselves — ask below if any of it is wrong.
      </p>
    </section>
  );
}

export function CannedAnswers({ canned }: { canned: Array<any> }) {
  return (
    <section className={card}>
      <div>
        <p className="text-sm font-medium text-ink">Quick answers</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          These appear as buttons above your keyboard when you reply. Tap one
          and it fills the box — you can still change the words before sending.
        </p>
      </div>
      {canned.map((c) => (
        <Form key={c.id} method="post" className="space-y-2 rounded-button border border-border p-3">
          <input type="hidden" name="intent" value="canned" />
          <input type="hidden" name="canned_id" value={c.id} />
          <input
            name="label"
            aria-label={`Quick answer name: ${c.label}`}
            defaultValue={c.label}
            className="w-full rounded-button border border-border px-3 py-2 text-sm font-medium"
          />
          <textarea
            name="body"
            aria-label={`Quick answer text: ${c.label}`}
            rows={3}
            defaultValue={c.body}
            className="w-full rounded-button border border-border px-3 py-2 text-base"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" variant="secondary">
              Save
            </Button>
            <button
              name="delete"
              value="1"
              className="rounded-button px-3 py-2 text-sm text-ember hover:bg-mist"
            >
              Remove
            </button>
          </div>
        </Form>
      ))}
      <Form method="post" className="space-y-2 rounded-button border border-dashed border-border p-3">
        <input type="hidden" name="intent" value="canned" />
        <input
          name="label"
          aria-label="New quick answer name"
          placeholder="Short name, e.g. Porters"
          className="w-full rounded-button border border-border px-3 py-2 text-sm"
        />
        <textarea
          name="body"
          aria-label="New quick answer text"
          rows={3}
          placeholder="The answer you keep writing again and again."
          className="w-full rounded-button border border-border px-3 py-2 text-base"
        />
        <Button type="submit" size="sm">
          Add answer
        </Button>
      </Form>
    </section>
  );
}

export function RatePayoutForm({
  guide,
  busy,
  then,
}: {
  guide: Guide;
  busy: boolean;
  then?: string;
}) {
  return (
    <Form method="post" className={card}>
      <input type="hidden" name="intent" value="commercial" />
      {then && <input type="hidden" name="then" value={then} />}
      <p className="text-sm font-medium text-ink">Rate & payout</p>
      <p className="text-sm text-ink-soft">
        Your day rate is yours in full — Trek's fee is added on top and paid by
        the trekker. We pay you in rupees, by hand, after each trek.
      </p>
      <label className="block text-sm">
        <span className="text-ink-soft">Day rate (USD)</span>
        <input
          name="day_rate_usd"
          type="number"
          min={1}
          inputMode="numeric"
          defaultValue={guide?.day_rate_usd_cents ? guide.day_rate_usd_cents / 100 : ""}
          placeholder="40"
          className={field}
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-soft">Payout method</span>
        <select name="payout_method" defaultValue={guide?.payout_method ?? "esewa"} className={field}>
          <option value="esewa">eSewa</option>
          <option value="khalti">Khalti</option>
          <option value="bank">Bank</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink-soft">Payout account</span>
        <input
          name="payout_account"
          defaultValue={guide?.payout_account ?? ""}
          placeholder="Phone number or account number"
          className={field}
        />
      </label>
      <label className="block text-sm">
        <span className="text-ink-soft">Name on the account</span>
        <input
          name="payout_account_name"
          defaultValue={guide?.payout_account_name ?? ""}
          placeholder="Exactly as your bank has it"
          className={field}
        />
      </label>
      <Button type="submit" size="sm" loading={busy}>
        {then ? "Save and continue" : "Save"}
      </Button>
    </Form>
  );
}

export function AskTeam({ busy }: { busy: boolean }) {
  return (
    <Form method="post" className="space-y-2 rounded-card border border-border bg-card p-4">
      <input type="hidden" name="intent" value="request" />
      <p className="text-sm font-medium text-ink">Ask our team for something else</p>
      <p className="text-sm text-ink-soft">
        Your name, your licence number, or anything above that looks wrong.
      </p>
      <textarea
        name="note"
        aria-label="Change request"
        rows={3}
        placeholder="e.g. My licence number has a typo — it should end 4471."
        className="w-full rounded-button border border-border px-3 py-2 text-sm"
      />
      <Button type="submit" size="sm" variant="secondary" loading={busy}>
        Send request
      </Button>
    </Form>
  );
}

/**
 * The guide's photographs: see them, add one, remove one, choose the portrait.
 *
 * Uploading goes through /api/journal-photo, which strips the GPS out of the
 * EXIF before a byte is stored. The row is only written once the file is up,
 * so a failed upload leaves nothing behind. Alt text is asked for in plain
 * words because these end up on indexed public pages.
 */
export function GuidePhotos({
  photos,
  busy,
  compact,
}: {
  photos: Array<{ id: string; url: string; kind: string; alt_text: string }>;
  busy: boolean;
  /** The setup step: lead with the face, fewer words. */
  compact?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/journal-photo", { method: "POST", body });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed.");
      setUrl(json.url);
    } catch (e: any) {
      setErr(e.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={card}>
      <div>
        <p className="text-sm font-medium text-ink">
          {compact ? "A photo of you" : "Your photographs"}
        </p>
        <p className="mt-0.5 text-sm text-ink-soft">
          {compact
            ? "Your face, outdoors, looking at the camera. Trekkers pick a person before they pick a trek."
            : "Your face, and the trail as you see it. The first one is what trekkers see beside your name."}
        </p>
      </div>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <li key={p.id} className="space-y-1">
              <div className="relative overflow-hidden rounded-button border border-border">
                <img src={p.url} alt={p.alt_text} className="aspect-square w-full object-cover" />
                {p.kind === "headshot" && (
                  <span className="absolute left-1 top-1 rounded-full bg-pine px-1.5 py-0.5 text-[10px] font-semibold text-paper">
                    Main
                  </span>
                )}
              </div>
              <div className="flex gap-2 text-xs">
                {p.kind !== "headshot" && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="photo" />
                    <input type="hidden" name="photo_id" value={p.id} />
                    <button name="make_main" value="1" className="text-moss underline">
                      Make main
                    </button>
                  </Form>
                )}
                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (!confirm("Remove this photo?")) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="photo" />
                  <input type="hidden" name="photo_id" value={p.id} />
                  <button name="delete" value="1" className="text-ember underline">
                    Remove
                  </button>
                </Form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Form method="post" className="space-y-2 border-t border-border pt-3">
        <input type="hidden" name="intent" value="photo" />
        <input type="hidden" name="url" value={url ?? ""} />
        <input
          ref={fileRef}
          type="file"
          aria-label="Choose a profile photo"
          accept="image/jpeg,image/png,image/webp"
          capture={compact ? "user" : undefined}
          className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-button file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:text-ink"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
          }}
        />
        {uploading && <p className="text-sm text-ink-soft">Sending the photo…</p>}
        {err && <p className="text-sm text-ember">{err}</p>}
        {url && (
          <>
            <img
              src={url}
              alt=""
              className="h-24 w-24 rounded-button border border-border object-cover"
            />
            <label className="block text-sm text-ink-soft">
              What is in this photo?
              <input
                name="alt_text"
                required
                maxLength={160}
                placeholder="Me at Gorak Shep, last April"
                className={field}
              />
            </label>
            <Button type="submit" size="sm" loading={busy}>
              Add this photo
            </Button>
          </>
        )}
      </Form>
    </section>
  );
}

/**
 * The voice introduction. A file picker rather than an in-browser recorder:
 * `accept="audio/*"` opens the phone's own voice-memo app, which needs no
 * microphone permission inside a web page on a cheap handset.
 */
export function GuideVoice({ url, busy }: { url: string | null; busy: boolean }) {
  const [fresh, setFresh] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(file: File) {
    setErr(null);
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/guide-voice", { method: "POST", body });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Upload failed.");
      setFresh(json.url);
    } catch (e: any) {
      setErr(e.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={card}>
      <div>
        <p className="text-sm font-medium text-ink">Your voice</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          About a minute. Say your name, where you are from, and one thing you
          want a trekker to know. Hearing you is the strongest thing on your
          profile.
        </p>
      </div>

      {url && !fresh && (
        <div className="space-y-2">
          <audio controls src={url} aria-label="Current voice introduction" className="w-full" />
          <Form method="post">
            <input type="hidden" name="intent" value="voice" />
            <button name="delete" value="1" className="text-xs text-ember underline">
              Remove recording
            </button>
          </Form>
        </div>
      )}

      <Form method="post" className="space-y-2">
        <input type="hidden" name="intent" value="voice" />
        <input type="hidden" name="url" value={fresh ?? ""} />
        <label className="block text-sm text-ink-soft">
          {url ? "Record a new one" : "Record one"}
          <input
            type="file"
            accept="audio/*"
            className="mt-1 block w-full text-sm text-ink-soft file:mr-3 file:rounded-button file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:text-ink"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) send(f);
            }}
          />
        </label>
        {uploading && <p className="text-sm text-ink-soft">Sending the recording…</p>}
        {err && <p className="text-sm text-ember">{err}</p>}
        {fresh && (
          <>
            <audio controls src={fresh} aria-label="New voice introduction" className="w-full" />
            <p className="text-xs text-ink-soft">Listen back before you save it.</p>
            <Button type="submit" size="sm" loading={busy}>
              Use this recording
            </Button>
          </>
        )}
      </Form>
    </section>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right text-ink">{value || "—"}</span>
    </div>
  );
}
