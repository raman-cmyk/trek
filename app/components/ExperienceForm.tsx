import { useState } from "react";
import { Form } from "react-router";
import { Button } from "~/components/Button";
import { type PriceBreakdown } from "~/lib/experience-pricing";
import { PriceBuilder, toDraft } from "~/components/PriceBuilder";
import { PhotoGallery, type GalleryPhoto } from "~/components/PhotoGallery";

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
  photos: GalleryPhoto[];
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
  const [kind, setKind] = useState(values?.kind ?? "trek");
  // Days is mirrored in state because per-day price lines multiply by it — a
  // guide changing 10 days to 14 must see the price move.
  const [days, setDays] = useState<number>(
    values?.days ?? ((values?.kind ?? "trek") === "trek" ? 12 : 1),
  );
  const [draft] = useState(() => toDraft(values?.price_breakdown ?? null));
  return (
    <Form method="post" className="space-y-4">
      {values?.id && <input type="hidden" name="experience_id" value={values.id} />}

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
          <input type="number" name="days" min={1} max={60} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} className={field} required />
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

      {/* ── The money. A library of lines, and the arithmetic done for them. */}
      <PriceBuilder kind={kind} days={days} initial={draft} />

      {/* ── The photographs. The cover is simply the first of them. */}
      <PhotoGallery initial={values?.photos ?? []} guideId={guideId} />

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : submitLabel}
      </Button>
    </Form>
  );
}
