import { Link } from "react-router";
import { cn } from "~/lib/cn";

/**
 * Pill chips with a tiny glyph — the filter vocabulary of every reference
 * ("Nearby · Mountain · Camping", "EXPLORE · EPIC VIEWS · AMONG TREES").
 *
 * One component, three shapes: a link (a filter that is a URL, which is every
 * filter on a server-rendered page), a button (a toggle inside a form), or a
 * plain span (a fact on a card). The glyph is optional and drawn here, so a
 * chip never depends on an icon font that has not arrived over 3G.
 */

export type ChipGlyph =
  | "mountain"
  | "tent"
  | "tree"
  | "city"
  | "camera"
  | "walk"
  | "star"
  | "pin"
  | "clock"
  | "people"
  | "altitude"
  | "calendar"
  | "route"
  | "check"
  | "spark";

const PATHS: Record<ChipGlyph, React.ReactNode> = {
  mountain: <path d="M2 12 6.5 4.5 9 8.5 10.5 6.5 14 12Z" />,
  tent: <path d="M8 3 2 13h12L8 3Zm0 4v6" />,
  tree: <path d="M8 2 4 8h2.5L4 12h8L9.5 8H12L8 2Zm0 10v2.5" />,
  city: <path d="M2 14V6h4v8M6 14V3h4v11M10 14V8h4v6" />,
  camera: <path d="M2 5h3l1.2-2h3.6L11 5h3v8H2V5Zm6 1.8a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z" />,
  walk: <path d="M9 2.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM7 14l1.5-4 1.5 1.5V14M5 9l2-3 2 .5 2 2M6.5 6 5 10" />,
  star: <path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4L2.2 6.5l4-.6L8 2.2Z" />,
  pin: <path d="M8 14s4-4.2 4-7.2A4 4 0 0 0 4 6.8C4 9.8 8 14 8 14Zm0-5.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />,
  clock: <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 3v3.2l2.2 1.3" />,
  people: <path d="M6 8a2.2 2.2 0 1 0 0-4.4A2.2 2.2 0 0 0 6 8Zm5-.4a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6ZM2 13.5c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M10.5 13.5c0-1.6 1.2-2.7 3-2.7" />,
  altitude: <path d="M2 13h12M8 3v8m0-8L5.5 5.5M8 3l2.5 2.5" />,
  calendar: <path d="M2.5 4h11v9.5h-11V4Zm0 3.2h11M5.5 2.5V5m5-2.5V5" />,
  route: <path d="M4 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm8-6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM4 9.5V8c0-2 1.5-2.5 4-2.5s4-.5 4-2" />,
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  spark: <path d="M8 2v3m0 6v3M2 8h3m6 0h3M4 4l2 2m4 4 2 2m0-8-2 2m-4 4-2 2" />,
};

export function Glyph({ name, className }: { name: ChipGlyph; className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      {PATHS[name]}
    </svg>
  );
}

const base =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3 text-sm transition-colors duration-quick";
const rest = "border-line bg-card text-ink hover:border-sage hover:bg-mist";
const on = "border-pine bg-pine text-paper";
const onPhoto = "glass border-transparent text-ink hover:bg-card";

export function Chip({
  glyph,
  selected = false,
  to,
  onClick,
  name,
  value,
  onPhoto: photo = false,
  className,
  children,
}: {
  glyph?: ChipGlyph;
  selected?: boolean;
  /** A filter that is a URL — the shape every server-rendered filter has. */
  to?: string;
  onClick?: () => void;
  /** With `value`, a submit button inside a GET form. */
  name?: string;
  value?: string;
  /** Sitting on a photograph rather than on paper. */
  onPhoto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = cn(base, selected ? on : photo ? onPhoto : rest, className);
  const inner = (
    <>
      {glyph && <Glyph name={glyph} className={selected ? "text-chartreuse" : "text-moss"} />}
      <span>{children}</span>
    </>
  );
  if (to) {
    return (
      <Link to={to} prefetch="intent" className={cls} aria-current={selected ? "true" : undefined}>
        {inner}
      </Link>
    );
  }
  if (name !== undefined || onClick) {
    return (
      <button
        type={name !== undefined ? "submit" : "button"}
        name={name}
        value={value}
        onClick={onClick}
        aria-pressed={selected}
        className={cls}
      >
        {inner}
      </button>
    );
  }
  return <span className={cls}>{inner}</span>;
}

/**
 * A row of chips: a snap rail bleeding to the screen edge on a phone, a
 * wrapping row on a desktop. The cut-off chip at the right edge is the
 * scroll affordance.
 */
export function ChipRow({
  children,
  className,
  wrap = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** Wrap on wide screens (default) or stay one scrolling row everywhere. */
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        "no-scrollbar snap-rail -mx-4 flex gap-2 overflow-x-auto px-4 py-1",
        wrap && "sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0",
        className,
      )}
    >
      {children}
    </div>
  );
}
