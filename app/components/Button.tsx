import { forwardRef } from "react";
import { cn } from "~/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-moss text-white hover:bg-pine",
  secondary:
    "bg-card text-ink border border-border hover:border-ink-soft hover:shadow-lift",
  ghost: "bg-transparent text-ink hover:bg-black/5",
  danger: "bg-ember text-white hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4",
  lg: "h-12 px-6 text-lg",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Shows an inline spinner, disables the button, keeps width fixed (§4). */
  loading?: boolean;
  /** Swaps the spinner to a checkmark for 600ms before navigating/closing (§4). */
  success?: boolean;
  /** Text shown next to the spinner while loading, e.g. "Sending…". */
  loadingText?: string;
}

/**
 * Every actionable element has all four states (docs/06 §4): press (scale to
 * 0.97), hover (primary darkens / cards lift), submitting (inline spinner,
 * fixed width, no reflow; success→checkmark), disabled (40% opacity).
 *
 * Width is held fixed during loading by keeping the label in the DOM
 * (visually hidden) and overlaying the spinner — so submitting never reflows.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      success = false,
      loadingText,
      disabled,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    const busy = loading || success;
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || busy}
        aria-busy={loading || undefined}
        className={cn(
          "relative inline-flex select-none items-center justify-center rounded-button font-medium",
          "transition-[transform,background-color,box-shadow,filter] duration-instant ease-press",
          "active:scale-[0.97]",
          "disabled:pointer-events-none disabled:opacity-40",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {/* Label stays mounted (opacity-0 when busy) to hold width — no reflow. */}
        <span className={cn(busy && "invisible")}>{children}</span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center gap-2">
            {success ? <Checkmark /> : <Spinner />}
            {loading && loadingText && (
              <span className="text-sm">{loadingText}</span>
            )}
          </span>
        )}
      </button>
    );
  },
);

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

function Checkmark() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M20 6L9 17l-5-5"
        className="[stroke-dasharray:24] [stroke-dashoffset:24] animate-[draw_400ms_var(--ease-out-soft)_forwards]"
      />
    </svg>
  );
}
