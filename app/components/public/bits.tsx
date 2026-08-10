import { Link } from "react-router";
import { cn } from "~/lib/cn";
import { SmartImage } from "~/components/SmartImage";
import { formatUsd } from "~/lib/pricing";

// Tier badges (§8): Verified mist/moss · Trusted sage/pine · Elite chartreuse/
// pine. Every badge links to /trust — a tier you can't look up is decoration.
export function TierBadge({ tier }: { tier: number }) {
  if (tier <= 0) return null;
  const map = {
    1: { cls: "bg-mist text-moss border border-sage", label: "✓ Verified" },
    2: { cls: "bg-sage text-pine", label: "✓✓ Trusted" },
    3: { cls: "bg-chartreuse text-pine", label: "★ Elite" },
  } as const;
  const t = map[Math.min(tier, 3) as 1 | 2 | 3];
  return (
    <Link
      to="/trust"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        t.cls,
      )}
    >
      {t.label}
    </Link>
  );
}

// Rating star is moss; the number is mono (the mono rule, §3).
export function Stars({
  value,
  count,
}: {
  value: number;
  count?: number;
}) {
  if (!value) {
    return <span className="text-caption text-muted">New guide</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span aria-hidden className="text-moss">
        ★
      </span>
      <span className="font-mono font-medium">{value.toFixed(1)}</span>
      {count != null && <span className="font-mono text-muted">({count})</span>}
    </span>
  );
}

export function ResponseChip({ mins }: { mins?: number | null }) {
  if (!mins) return null;
  const label =
    mins < 60
      ? `~${mins} min`
      : `~${Math.round(mins / 60)} hour${mins >= 120 ? "s" : ""}`;
  return (
    <span className="inline-flex items-center rounded-full bg-mist px-2 py-0.5 text-xs text-muted">
      Usually responds in&nbsp;<span className="font-mono text-ink">{label}</span>
    </span>
  );
}

/** The signature brand element: guide face + name, links to the profile. */
export function GuideChip({
  slug,
  name,
  avatarUrl,
  tier,
  overlap = false,
  fullName = false,
}: {
  slug: string;
  name: string;
  avatarUrl?: string | null;
  tier?: number;
  overlap?: boolean;
  /** Show the guide's full name (experience cards) rather than first name. */
  fullName?: boolean;
}) {
  const verified = !!tier && tier >= 1;
  return (
    <Link
      to={`/guides/${slug}`}
      prefetch="intent"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-card/95 py-1 pl-1 pr-2.5 text-sm shadow-card backdrop-blur",
        // Avatar frame (§6): sage ring + paper gap; moss ring when verified.
        overlap && "ring-2 ring-offset-2 ring-offset-paper",
        overlap && (verified ? "ring-moss" : "ring-sage"),
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <SmartImage
        src={avatarUrl ?? ""}
        alt={name}
        width={32}
        height={32}
        className="h-7 w-7 rounded-full"
      />
      <span className="font-medium text-ink">
        {fullName ? name : name.split(" ")[0]}
      </span>
      {verified && <span className="text-moss">✓</span>}
    </Link>
  );
}

// Transparent price breakdown — never a bare total (docs/04).
export function PriceBreakdown({
  rows,
  total,
}: {
  rows: Array<{ label: string; usdCents: number }>;
  total: number;
}) {
  return (
    <dl className="space-y-1 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between">
          <dt className="text-muted">{r.label}</dt>
          <dd className="font-mono">{formatUsd(r.usdCents)}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium">
        <dt>Total</dt>
        <dd className="font-mono">{formatUsd(total)}</dd>
      </div>
    </dl>
  );
}

export function ReviewBlock({
  authorName,
  country,
  overall,
  body,
  date,
}: {
  authorName: string;
  country?: string | null;
  overall: number;
  body?: string | null;
  date?: string | null;
}) {
  return (
    <figure className="space-y-1">
      <div className="flex items-center gap-2">
        <Stars value={overall} />
        <figcaption className="text-sm text-ink-soft">
          {authorName}
          {country ? `, ${country}` : ""}
          {date ? ` · ${new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
        </figcaption>
      </div>
      {body && <blockquote className="text-ink">{body}</blockquote>}
    </figure>
  );
}
