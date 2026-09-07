import { Form, Link } from "react-router";
import { Button } from "~/components/Button";
import { formatUsd } from "~/lib/pricing";

export interface PackageCardData {
  id: string;
  title: string | null;
  days: number;
  partySize: number;
  startDate: string;
  totalUsdCents: number;
  depositUsdCents: number;
  note: string | null;
  status: string;
  bookingId: string | null;
  /** Lines the package includes, in the guide's own words. */
  includes: string[];
}

/**
 * A package, inside the conversation it was agreed in.
 *
 * The trekker's answer is one button, and it is the payment: approving and
 * paying are the same decision, and splitting them across two screens is where
 * people go and think about it and never come back.
 */
export function PackageCard({
  p,
  isTrekker,
}: {
  p: PackageCardData;
  isTrekker: boolean;
}) {
  const each = Math.round(p.totalUsdCents / Math.max(1, p.partySize));
  const open = p.status === "proposed";

  return (
    <div className="rounded-card border border-moss/50 bg-card p-3">
      <p className="label text-moss">A package for you</p>
      <p className="mt-1 font-medium text-ink">
        {p.title ?? "Your trip"} — {p.days} {p.days === 1 ? "day" : "days"} for {p.partySize}
      </p>
      <p className="text-caption text-muted">Starting {p.startDate}</p>

      {p.note && <p className="mt-2 text-sm text-ink">“{p.note}”</p>}

      {p.includes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-caption text-ink-soft">
          {p.includes.map((l) => (
            <li key={l} className="flex gap-1.5">
              <span aria-hidden="true" className="text-moss">
                ·
              </span>
              {l}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-baseline justify-between border-t border-line pt-2">
        <span className="text-sm text-ink-soft">Whole trip</span>
        <span className="font-mono text-ink">{formatUsd(p.totalUsdCents)}</span>
      </div>
      <div className="flex items-baseline justify-between text-caption text-muted">
        <span>Each person</span>
        <span className="font-mono">{formatUsd(each)}</span>
      </div>

      {open && isTrekker ? (
        <Form method="post" action={`/proposals/${p.id}`} className="mt-3">
          <input type="hidden" name="intent" value="approve" />
          <Button type="submit" className="w-full">
            Approve and pay {formatUsd(p.depositUsdCents)}
          </Button>
          <p className="mt-1.5 text-center text-caption text-muted">
            Holds your dates. The rest is due 14 days before you leave.
          </p>
        </Form>
      ) : open ? (
        <p className="mt-3 text-caption text-muted">Waiting for them to approve it.</p>
      ) : (
        <p className="mt-3 text-caption text-muted">
          {p.status === "approved"
            ? "Approved."
            : p.status === "declined"
              ? "Turned down."
              : "Replaced by a newer one."}
          {p.bookingId && (
            <>
              {" "}
              <Link to={`/trips/${p.bookingId}`} className="text-moss underline underline-offset-4">
                Open the trip →
              </Link>
            </>
          )}
        </p>
      )}

      <Link
        to={`/proposals/${p.id}`}
        className="mt-2 block text-caption text-moss underline underline-offset-4"
      >
        See everything in it →
      </Link>
    </div>
  );
}
