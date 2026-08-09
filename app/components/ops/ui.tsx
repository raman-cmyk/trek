import { cn } from "~/lib/cn";

// Ops admin is desktop, dense, function over form (docs/04 §Ops admin).
// Plain, fast, keyboard-friendly building blocks.

type Tone = "neutral" | "amber" | "teal" | "red" | "blue" | "green";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-stone-100 text-stone-700",
  amber: "bg-amber-100 text-amber-800",
  teal: "bg-teal-100 text-teal-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-blue-100 text-blue-800",
  green: "bg-emerald-100 text-emerald-800",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Panel({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          {title && <h2 className="font-medium text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-ink-soft">{children}</p>;
}
