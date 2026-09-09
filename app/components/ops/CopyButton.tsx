import { useState } from "react";
import { cn } from "~/lib/cn";

/**
 * Puts a value on the clipboard and says so for a moment.
 *
 * Swallows a refused clipboard (http, an old WebView) rather than throwing:
 * the value is always printed beside the button, so the long way still works.
 */
export function CopyButton({
  value,
  label = "Copy",
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* printed beside it anyway */
        }
      }}
      className={cn(
        "rounded border border-border bg-card px-2 py-0.5 text-xs text-ink hover:border-moss",
        done && "border-moss bg-moss/10 text-pine",
        className,
      )}
      aria-live="polite"
    >
      {done ? "Copied" : label}
    </button>
  );
}
