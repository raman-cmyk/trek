import { Link } from "react-router";
import { cn } from "~/lib/cn";
import type { HomeRow } from "~/lib/guide-home";

/**
 * The guide's home screen, as one column of plain sentences.
 *
 * Rows, not tiles. A 2×3 grid of nouns with arrows reads as a menu you have
 * to decode; a list where each line says what it is and what is behind it
 * reads as a page. Each row is a full-width tap target — the guide dashboard
 * is used on a cheap Android in a lodge, one thumb, and CLAUDE.md rule 6 says
 * 360px is the screen to design for, not the one to check afterwards.
 *
 * Why the note under each label matters more here than anywhere else in the
 * product: for most guides this is the third language they read in, and
 * "Reviews" alone is a word to work out. "Reviews / What trekkers said about
 * walking with you" is a sentence.
 */
export function HomeList({ rows }: { rows: HomeRow[] }) {
  return (
    <nav aria-label="Your guide pages">
      <ul className="overflow-hidden rounded-photo border border-border bg-card">
        {rows.map((r, i) => (
          <li key={r.key}>
            <Link
              to={r.to}
              prefetch="intent"
              className={cn(
                "flex items-center gap-3 px-4 py-3.5 transition-colors",
                i > 0 && "border-t border-line",
                r.loud ? "bg-chartreuse hover:brightness-95" : "hover:bg-mist",
              )}
            >
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-sm font-medium",
                    r.loud ? "text-pine" : "text-ink",
                  )}
                >
                  {r.label}
                </span>
                <span className="mt-0.5 block text-caption text-ink-soft">{r.note}</span>
              </span>
              {r.badge !== null && (
                <span
                  aria-label={`${r.badge} waiting`}
                  className="shrink-0 rounded-full bg-ember px-1.5 text-center font-mono text-[11px] leading-5 text-white"
                >
                  {r.badge > 9 ? "9+" : r.badge}
                </span>
              )}
              <span aria-hidden className="shrink-0 text-primary">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
