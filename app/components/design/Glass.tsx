import { cn } from "~/lib/cn";

/**
 * A surface that floats on a photograph (docs/07).
 *
 * Two tones only. Light carries controls, labels and small facts; dark is the
 * panel at the foot of a photo that carries white type. Neither belongs on
 * cream — glass over paper is a grey box with a blur bill — so the caller is
 * responsible for putting something behind it.
 */
export function Glass({
  tone = "light",
  as: Tag = "div",
  className,
  children,
  ...rest
}: {
  tone?: "light" | "dark";
  as?: "div" | "section" | "span" | "aside" | "header" | "footer";
  className?: string;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, "className" | "children">) {
  return (
    <Tag
      className={cn(
        "rounded-photo",
        tone === "dark" ? "glass-dark" : "glass text-ink",
        className,
      )}
      {...(rest as any)}
    >
      {children}
    </Tag>
  );
}

/** A small glass pill — a single fact or label sitting on a photo. */
export function GlassPill({
  tone = "light",
  className,
  children,
}: {
  tone?: "light" | "dark";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption font-medium",
        tone === "dark" ? "glass-dark" : "glass text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}
