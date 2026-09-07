import { useState } from "react";
import { useFetcher } from "react-router";
import { Button } from "~/components/Button";
import {
  partyAmounts,
  type PriceBreakdown,
  type PriceLine,
} from "~/lib/experience-pricing";
import { composePackage } from "~/lib/packages";
import { formatUsd } from "~/lib/pricing";

/**
 * The changes a guide actually makes to a trip.
 *
 * A day either way, a different group, the extras in or out, and one line of
 * their own — priced live, because a guide proposing a change should never
 * have to wonder what they just charged. Shared by the request list and the
 * message thread so a package agreed in conversation is the same object as one
 * agreed through the booking form.
 */
export function PackageComposer({
  base,
  options,
  defaults,
  hidden,
  action,
  onSent,
  submitLabel = "Send this to them",
}: {
  base: PriceBreakdown;
  /** The offering's optional lines, as tick boxes. */
  options: PriceLine[];
  defaults: { days: number; partySize: number; startDate: string; optionIds?: string[] };
  /** Extra form fields the route needs (enquiry id, conversation id, intent). */
  hidden: Record<string, string>;
  action?: string;
  onSent?: () => void;
  submitLabel?: string;
}) {
  const fetcher = useFetcher<{ ok?: string; error?: string }>();
  const [days, setDays] = useState(defaults.days);
  const [party, setParty] = useState(defaults.partySize);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [picked, setPicked] = useState<Set<string>>(new Set(defaults.optionIds ?? []));
  const [extraLabel, setExtraLabel] = useState("");
  const [extraUsd, setExtraUsd] = useState("");
  const busy = fetcher.state !== "idle";

  // A sent package closes the composer rather than sitting there inviting a
  // second one by accident.
  if (fetcher.state === "idle" && fetcher.data?.ok && onSent) onSent();

  const extraLines: PriceLine[] =
    extraLabel.trim() && Number(extraUsd) > 0
      ? [
          {
            id: "preview",
            label: extraLabel.trim(),
            amountUsdCents: Math.round(Number(extraUsd) * 100),
            basis: "person",
            cadence: "trip",
            optional: false,
            bucket: "logistics",
          },
        ]
      : [];

  const composed = composePackage(base, {
    days,
    includedOptionIds: [...picked],
    extraLines,
  });
  const amounts = partyAmounts(composed, party, startDate);
  const each = Math.round(amounts.totalUsdCents / Math.max(1, party));

  const field =
    "mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-base text-ink outline-none focus:border-moss";

  return (
    <fetcher.Form method="post" action={action} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <div className="grid grid-cols-3 gap-2">
        <label className="block text-caption text-ink-soft">
          Days
          <input
            type="number"
            name="days"
            min={1}
            max={60}
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
            className={field}
          />
        </label>
        <label className="block text-caption text-ink-soft">
          People
          <input
            type="number"
            name="party_size"
            min={1}
            max={24}
            value={party}
            onChange={(e) => setParty(Math.max(1, Number(e.target.value) || 1))}
            className={field}
          />
        </label>
        <label className="block text-caption text-ink-soft">
          Starts
          <input
            type="date"
            name="start_date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={field}
          />
        </label>
      </div>

      {options.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-caption text-ink-soft">What is included</p>
          {options.map((o) => (
            <label key={o.id} className="flex items-center justify-between gap-3 text-sm text-ink">
              <span>{o.label}</span>
              <input
                type="checkbox"
                name="option"
                value={o.id}
                checked={picked.has(o.id)}
                onChange={() =>
                  setPicked((s) => {
                    const n = new Set(s);
                    n.has(o.id) ? n.delete(o.id) : n.add(o.id);
                    return n;
                  })
                }
              />
            </label>
          ))}
        </div>
      )}

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <label className="block text-caption text-ink-soft">
          Add one more thing
          <input
            name="extra_label"
            value={extraLabel}
            onChange={(e) => setExtraLabel(e.target.value)}
            placeholder="Helicopter out from Lukla"
            maxLength={60}
            className={field}
          />
        </label>
        <label className="block text-caption text-ink-soft">
          $ each
          <input
            name="extra_usd"
            type="number"
            min={0}
            step="1"
            value={extraUsd}
            onChange={(e) => setExtraUsd(e.target.value)}
            className={field}
          />
        </label>
      </div>

      <label className="block text-caption text-ink-soft">
        Say why, in your words
        <textarea
          name="note"
          rows={2}
          maxLength={800}
          placeholder="Two extra nights at Namche — you will walk it far better acclimatised."
          className={field}
        />
      </label>

      <div className="rounded-md bg-mist p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-ink-soft">They pay, each</span>
          <span className="font-mono font-medium text-ink">{formatUsd(each)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-ink-soft">Whole trip</span>
          <span className="font-mono text-ink">{formatUsd(amounts.totalUsdCents)}</span>
        </div>
      </div>

      {fetcher.data?.error && (
        <p className="text-caption text-ember">{fetcher.data.error}</p>
      )}

      <Button type="submit" loading={busy} className="w-full">
        {submitLabel}
      </Button>
      <p className="text-caption text-muted">
        Nothing is booked until they approve it and pay the deposit.
      </p>
    </fetcher.Form>
  );
}
