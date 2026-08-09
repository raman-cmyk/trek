import { Link } from "react-router";
import { cn } from "~/lib/cn";
import { SmartImage } from "~/components/SmartImage";
import { formatUsd } from "~/lib/pricing";

// Tier badges (docs/04): T1 teal outline, T2 solid teal, T3 gold.
export function TierBadge({ tier }: { tier: number }) {
  if (tier <= 0) return null;
  const map = {
    1: { cls: "border border-accent text-accent", label: "✓ Verified" },
    2: { cls: "bg-accent text-white", label: "✓✓ Trusted" },
    3: { cls: "bg-gold text-white", label: "★ Elite" },
  } as const;
  const t = map[Math.min(tier, 3) as 1 | 2 | 3];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium",
        t.cls,
      )}
    >
      {t.label}
    </span>
  );
}

export function Stars({
  value,
  count,
}: {
  value: number;
  count?: number;
}) {
  if (!value) {
    return <span className="text-xs text-ink-soft">New guide</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span aria-hidden className="text-gold">
        ★
      </span>
      <span className="font-medium">{value.toFixed(1)}</span>
      {count != null && <span className="text-ink-soft">({count})</span>}
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
    <span className="inline-flex items-center rounded-pill bg-surface px-2 py-0.5 text-xs text-ink-soft">
      Usually responds in {label}
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
}: {
  slug: string;
  name: string;
  avatarUrl?: string | null;
  tier?: number;
  overlap?: boolean;
}) {
  return (
    <Link
      to={`/guides/${slug}`}
      prefetch="intent"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill bg-card/95 py-1 pl-1 pr-2.5 text-sm shadow-card backdrop-blur",
        overlap && "ring-2 ring-card",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <SmartImage
        src={avatarUrl ?? ""}
        alt={name}
        width={32}
        height={32}
        avgColor="#d6d3d1"
        className="h-7 w-7 rounded-full"
      />
      <span className="font-medium text-ink">{name.split(" ")[0]}</span>
      {tier && tier >= 1 && <span className="text-accent">✓</span>}
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
          <dt className="text-ink-soft">{r.label}</dt>
          <dd>{formatUsd(r.usdCents)}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-border pt-1 font-medium">
        <dt>Total</dt>
        <dd>{formatUsd(total)}</dd>
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
