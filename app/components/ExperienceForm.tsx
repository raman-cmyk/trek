import { useState } from "react";
import { Form } from "react-router";
import { Button } from "~/components/Button";
import { computeExperiencePricing, type PriceBreakdown } from "~/lib/experience-pricing";
import { formatUsd } from "~/lib/pricing";

/**
 * One form for an experience, shared by the guide (/g/experiences) and the
 * office (/ops/experiences).
 *
 * Written for a guide on a phone with second-language English: plain words,
 * one thing per row, money asked for in dollars not cents, and the price a
 * client will actually see computed live at the bottom — a guide should
 * never have to do the platform's arithmetic to know what his trip costs.
 */

export interface ExperienceValues {
  id?: string;
  kind: string;
  title: string;
  summary: string;
  route_id: string | null;
  days: number;
  min_party: number;
  max_party: number;
  cover_photo_url: string | null;
  price_breakdown: PriceBreakdown | null;
  status: string;
}

export const KINDS = [
  ["trek", "Multi-day trek"],
  ["day_hike", "Day hike"],
  ["food_culture", "Food & culture"],
  ["adventure", "Adventure"],
  ["city", "City experience"],
] as const;

const field =
  "mt-1 w-full rounded border border-line bg-paper px-3 py-2.5 text-base text-ink outline-none focus:border-moss";
const label = "block text-sm text-ink-soft";

/** Dollars in the form, cents in the database. */
const toC = (v: string) => Math.round((Number(v) || 0) * 100);
const toD = (c: number | undefined | null) => (c ? (c / 100).toString() : "");

export function ExperienceForm({
  values,
  routes,
  guideId,
  submitLabel,
  busy,
}: {
  values?: Partial<ExperienceValues>;
  routes: Array<{ id: string; name: string }>;
  guideId: string;
  submitLabel: string;
  busy?: boolean;
}) {
  const bd = values?.price_breakdown ?? null;
  const [kind, setKind] = useState(values?.kind ?? "trek");
  const [cover, setCover] = useState(values?.cover_photo_url ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  // The live quote: what a group of two would pay, recomputed as the money
  // fields change. Uncontrolled inputs + a light state mirror.
  const [money, setMoney] = useState({
    guide: bd?.guide_fee_total_usd_cents ?? 0,
    permits: bd?.permits_usd_cents ?? 0,
    porters: bd?.porters_usd_cents ?? 0,
    logistics: bd?.logistics_usd_cents ?? 0,
  });
  const quote = computeExperiencePricing(
    {
      guide_fee_total_usd_cents: money.guide,
      permits_usd_cents: money.permits,
      porters_usd_cents: money.porters,
      logistics_usd_cents: money.logistics,
      trek_pct: 0.1,
      fund_pct: 0.03,
    },
    2,
  );

  async function upload(file: File) {
    setUploading(true);
    setUploadErr(null);
    const body = new FormData();
    body.append("file", file);
    body.append("guide_id", guideId);
    try {
      const res = await fetch("/api/journal-photo", { method: "POST", body });
      const json: any = await res.json();
      if (!res.ok) setUploadErr(json?.error ?? "That didn't send. Try again.");
      else setCover(json.url);
    } catch {
      setUploadErr("No connection. Try again when you have signal.");
    }
    setUploading(false);
  }

  return (
    <Form method="post" className="space-y-4">
      {values?.id && <input type="hidden" name="experience_id" value={values.id} />}
      <input type="hidden" name="cover_photo_url" value={cover} />

      <label className={label}>
        What kind of trip is it?
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={field}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>

      <label className={label}>
        Name it the way you would say it
        <input
          name="title"
          defaultValue={values?.title ?? ""}
          maxLength={80}
          placeholder="Gokyo Lakes, properly acclimatised"
          className={field}
          required
        />
      </label>

      <label className={label}>
        Two or three sentences on what makes it yours
        <textarea
          name="summary"
          rows={3}
          defaultValue={values?.summary ?? ""}
          maxLength={400}
          className={field}
          required
        />
      </label>

      {kind === "trek" && (
        <label className={label}>
          Which route
          <select name="route_id" defaultValue={values?.route_id ?? ""} className={field} required>
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
      )}

      <div className="grid grid-cols-3 gap-3">
        <label className={label}>
          Days
          <input type="number" name="days" min={1} max={60} defaultValue={values?.days ?? (kind === "trek" ? 12 : 1)} className={field} required />
        </label>
        <label className={label}>
          Smallest group
          <input type="number" name="min_party" min={1} max={16} defaultValue={values?.min_party ?? 1} className={field} required />
        </label>
        <label className={label}>
          Largest group
          <input type="number" name="max_party" min={1} max={16} defaultValue={values?.max_party ?? 6} className={field} required />
        </label>
      </div>

      {/* ── The money, in plain rows. ─────────────────────────────────────── */}
      <fieldset className="rounded-md border border-line bg-card p-4">
        <legend className="px-1 text-sm font-medium text-ink">The price, line by line</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            Your fee for the whole trip ($)
            <input
              type="number" step="0.01" min={0} name="guide_fee_usd"
              defaultValue={toD(bd?.guide_fee_total_usd_cents)}
              onChange={(e) => setMoney((m) => ({ ...m, guide: toC(e.target.value) }))}
              className={field} required
            />
            <span className="mt-0.5 block text-caption text-muted">Yours in full — we add our 10% on top.</span>
          </label>
          <label className={label}>
            Permits, per person ($)
            <input
              type="number" step="0.01" min={0} name="permits_usd"
              defaultValue={toD(bd?.permits_usd_cents)}
              onChange={(e) => setMoney((m) => ({ ...m, permits: toC(e.target.value) }))}
              className={field}
            />
            <span className="mt-0.5 block text-caption text-muted">Charged at cost, shown to the client as permits.</span>
          </label>
          <label className={label}>
            Porters, per person ($)
            <input
              type="number" step="0.01" min={0} name="porters_usd"
              defaultValue={toD(bd?.porters_usd_cents)}
              onChange={(e) => setMoney((m) => ({ ...m, porters: toC(e.target.value) }))}
              className={field}
            />
          </label>
          <label className={label}>
            Lodges & food, per person ($)
            <input
              type="number" step="0.01" min={0} name="logistics_usd"
              defaultValue={toD(bd?.logistics_usd_cents)}
              onChange={(e) => setMoney((m) => ({ ...m, logistics: toC(e.target.value) }))}
              className={field}
            />
          </label>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-sm text-ink">
          A group of two would pay{" "}
          <span className="font-mono font-medium">{formatUsd(quote.perPersonUsdCents)}</span>{" "}
          each. You would earn{" "}
          <span className="font-mono font-medium">{formatUsd(money.guide)}</span> for the trip.
        </p>
      </fieldset>

      {/* ── The cover photograph. ────────────────────────────────────────── */}
      <div>
        <p className={label}>Cover photo — the picture that sells it</p>
        {cover ? (
          <div className="mt-1.5 flex items-center gap-3">
            <img src={cover} alt="" className="h-20 w-32 rounded object-cover" />
            <button
              type="button"
              onClick={() => setCover("")}
              className="text-sm text-ember underline underline-offset-4"
            >
              Change it
            </button>
          </div>
        ) : (
          <label className="mt-1.5 block cursor-pointer rounded-md border border-dashed border-line bg-card p-4 text-center text-sm text-ink-soft hover:border-sage">
            {uploading ? "Sending…" : "Add a photo from your phone"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
          </label>
        )}
        {uploadErr && <p className="mt-2 rounded bg-ember/10 px-3 py-2 text-sm text-ember">{uploadErr}</p>}
      </div>

      <Button type="submit" disabled={busy || uploading}>
        {busy ? "Saving…" : submitLabel}
      </Button>
    </Form>
  );
}
