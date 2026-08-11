import { Link } from "react-router";
import { cn } from "~/lib/cn";
import { SmartImage } from "~/components/SmartImage";
import { useMoney } from "~/lib/currency-context";
import { firstName } from "~/lib/names";

// Tier badges (§8): Verified mist/moss · Trusted sage/pine · Elite chartreuse/
// pine. Every badge links to /trust — a tier you can't look up is decoration.
export function TierBadge({ tier, static: isStatic = false }: { tier: number; static?: boolean }) {
  if (tier <= 0) return null;
  // Quiet on purpose. A badge is a footnote about the guide; the face and the
  // sentence they wrote are the card. Filled chartreuse pulled the eye off both.
  const map = {
    1: { cls: "border-line bg-paper/90 text-muted", label: "Verified" },
    2: { cls: "border-sage bg-paper/90 text-moss", label: "Trusted" },
    3: { cls: "border-moss bg-paper/90 text-moss", label: "Elite" },
  } as const;
  const t = map[Math.min(tier, 3) as 1 | 2 | 3];
  const cls = cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-medium uppercase tracking-[0.06em] backdrop-blur",
    t.cls,
  );
  // Inside a card the whole body is a link, and an <a> in an <a> is invalid
  // HTML — the browser un-nests it and hydration then fails on the whole page.
  if (isStatic) return <span className={cls}>{t.label}</span>;
  return (
    <Link to="/trust" onClick={(e) => e.stopPropagation()} className={cls}>
      {t.label}
    </Link>
  );
}

/**
 * Rating: star + score at 15px mono, the count quieter and smaller behind it.
 *
 * The no-rating case renders at the same height rather than collapsing —
 * otherwise a row of cards where two guides are new and three are rated has
 * its whole bottom edge stepping up and down, which is the drift that made
 * the homepage look assembled rather than laid out.
 */
export function Stars({
  value,
  count,
}: {
  value: number;
  count?: number;
}) {
  if (!value) {
    return (
      <span className="inline-flex h-5 items-center text-[13px] text-muted">New guide</span>
    );
  }
  return (
    <span className="inline-flex h-5 items-baseline gap-1.5">
      <span aria-hidden className="text-[13px] leading-none text-moss">
        ★
      </span>
      <span className="font-mono text-[15px] font-medium leading-none text-ink">
        {value.toFixed(1)}
      </span>
      {count != null && (
        <span className="font-mono text-[13px] leading-none text-muted">{count}</span>
      )}
    </span>
  );
}

export function ResponseChip({ mins }: { mins?: number | null }) {
  if (!mins) return null;
  const label =
    mins < 60
      ? `~${mins} min`
      : `~${Math.round(mins / 60)} hour${Math.round(mins / 60) > 1 ? "s" : ""}`;
  // Sentence in the sans, figure in the mono. A whole phrase set in mono reads
  // as a code sample; the point of the mono is to mark the number.
  return (
    <span className="inline-flex items-center text-[13px] text-muted">
      Replies in&nbsp;<span className="font-mono text-ink">{label}</span>
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
  static: isStatic = false,
}: {
  slug: string;
  name: string;
  avatarUrl?: string | null;
  tier?: number;
  overlap?: boolean;
  /** Show the guide's full name (experience cards) rather than first name. */
  fullName?: boolean;
  /**
   * Render as a plain span. Required inside OfferingCard, whose whole body is
   * already a link: an <a> nested in an <a> is invalid HTML, the browser
   * un-nests it during parsing, and React's hydration then finds a DOM that
   * doesn't match what it rendered — which is what was throwing "Hydration
   * failed" on every page with an experience card on it.
   */
  static?: boolean;
}) {
  const verified = !!tier && tier >= 1;
  const inner = (
    <>
      <SmartImage
        src={avatarUrl ?? ""}
        alt={name}
        width={32}
        height={32}
        className="h-7 w-7 rounded-full"
      />
      <span className="font-medium text-ink">{fullName ? name : firstName(name)}</span>
      {verified && <span className="text-moss">✓</span>}
    </>
  );
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded-full bg-card/95 py-1 pl-1 pr-2.5 text-sm shadow-card backdrop-blur",
    // Avatar frame (§6): sage ring + paper gap; moss ring when verified.
    overlap && "ring-2 ring-offset-2 ring-offset-paper",
    overlap && (verified ? "ring-moss" : "ring-sage"),
  );

  if (isStatic) return <span className={cls}>{inner}</span>;
  return (
    <Link to={`/guides/${slug}`} prefetch="intent" className={cls} onClick={(e) => e.stopPropagation()}>
      {inner}
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
  const { toMinor, fmtMinor } = useMoney();
  // The total shown is the total CHARGED (the caller's authoritative figure).
  // If the visible lines don't sum to it, say so instead of silently lying —
  // that mismatch is a bug upstream (audit B2), never something to normalise.
  const rowSumUsd = rows.reduce((s, r) => s + r.usdCents, 0);
  const mismatch = Math.abs(rowSumUsd - total) > 1;
  return (
    <dl className="space-y-1 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex justify-between">
          <dt className="text-muted">{r.label}</dt>
          <dd className="font-mono">{fmtMinor(toMinor(r.usdCents))}</dd>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium">
        <dt>Total</dt>
        <dd className="font-mono">{fmtMinor(toMinor(total))}</dd>
      </div>
      {mismatch && (
        <p className="text-xs text-ember">
          These lines don't add up to the total — please contact us before paying.
        </p>
      )}
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

/**
 * only_with_me — the one thing you get with this guide and nobody else, in
 * their own words. A pull-quote, never body text: it is the first thing a
 * trekker should read after the name, and it has to look like a person said
 * it rather than like a description we wrote about them.
 *
 * Published unedited, second-language English and all. Do not add a full stop,
 * fix an article, or sand the voice off — that voice is the differentiator.
 */
export function OnlyWithMe({
  line,
  firstName,
  size = "card",
  large = false,
}: {
  line: string;
  /** Attribution on the profile variant ("— in Maya's words"). */
  firstName?: string;
  size?: "card" | "profile";
  /** The lead card in a row gets the quote a step larger. */
  large?: boolean;
}) {
  // A hanging quote mark, not the chartreuse left bar. That bar is the site's
  // pull-quote device and it is on the journal, the guide profile and the
  // route page — using it here too made every surface read the same. A mark
  // that hangs into the margin reads as somebody talking.
  if (size === "card") {
    return (
      <p
        className={cn(
          "relative font-display text-ink",
          "text-[19px] font-medium leading-[1.3] tracking-[-0.02em]",
          large && "sm:text-[21px]",
        )}
      >
        <span
          aria-hidden
          className="absolute -left-[0.45em] top-[-0.08em] font-display text-[1.4em] leading-none text-sage"
        >
          “
        </span>
        {line}
      </p>
    );
  }
  return (
    <figure className="relative">
      <blockquote className="relative font-display text-xl font-medium leading-[1.25] tracking-[-0.02em] text-ink sm:text-[28px]">
        <span
          aria-hidden
          className="absolute -left-[0.42em] top-[-0.06em] font-display text-[1.3em] leading-none text-sage"
        >
          “
        </span>
        {line}
      </blockquote>
      {firstName && (
        <figcaption className="mt-1.5 text-caption text-muted">
          — {firstName}'s words, printed as written
        </figcaption>
      )}
    </figure>
  );
}
