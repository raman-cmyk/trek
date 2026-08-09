import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "~/lib/cn";
import { useIsMobile, usePrefersReducedMotion } from "~/lib/motion";

/**
 * ONE surface, two presentations (docs/06 §6): a draggable bottom sheet on
 * mobile and a centered scale+fade modal on desktop. Used everywhere a
 * transient surface is needed — date pickers, filters, booking config, the
 * "what we checked" details, photo viewer, login. Do NOT build two.
 *
 * Mobile: slides up (--dur-base, ease-out-soft); a grab handle drags the sheet
 * 1:1 with the finger; releasing past ~40% height or with enough velocity
 * dismisses; backdrop tap dismisses; body scrolls inside.
 * Desktop: fades + scales 0.96→1; backdrop blur + dim; Esc / backdrop close;
 * focus trapped and returned to the trigger on close.
 * Reduced motion: opacity-only, no transforms.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();

  // Two-phase mount so we can animate both entrance and exit.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragLastY = useRef(0);
  const dragLastT = useRef(0);

  const DUR_BASE = 300;
  const DUR_QUICK = 220;

  // Entrance / exit orchestration.
  useEffect(() => {
    if (open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      setMounted(true);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
    if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), reduced ? DUR_QUICK : DUR_BASE);
      return () => clearTimeout(t);
    }
  }, [open, mounted, reduced]);

  // Lock body scroll + focus the panel + restore focus on close.
  useLayoutEffect(() => {
    if (!mounted) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [mounted]);

  // Esc to close + focus trap (Tab cycles within the panel).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  // ---- Bottom-sheet drag (finger-tracked, §6) ----
  const setTransform = (y: number, transition: string) => {
    const el = panelRef.current;
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = `translateY(${y}px)`;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!isMobile || reduced) return;
    dragStartY.current = e.clientY;
    dragLastY.current = e.clientY;
    dragLastT.current = e.timeStamp;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    dragLastY.current = e.clientY;
    dragLastT.current = e.timeStamp;
    setTransform(dy, "none");
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    const height = panelRef.current?.offsetHeight ?? 1;
    const dt = e.timeStamp - dragLastT.current || 1;
    const velocity = (e.clientY - dragLastY.current) / dt; // px/ms downward
    dragStartY.current = null;
    // Dismiss past 40% of height or with sufficient downward velocity.
    if (dy > height * 0.4 || velocity > 0.5) {
      onClose();
    } else {
      setTransform(0, `transform ${DUR_QUICK}ms var(--ease-out-soft)`);
    }
  };

  if (!mounted) return null;

  const backdrop = (
    <div
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-40 bg-black/40 transition-opacity ease-out-soft",
        isMobile ? "duration-base" : "backdrop-blur-[4px] duration-base",
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-hidden="true"
    />
  );

  const panelMotion = reduced
    ? cn(
        "transition-opacity duration-quick ease-out-soft",
        visible ? "opacity-100" : "opacity-0",
      )
    : isMobile
      ? cn(
          "transition-transform duration-base ease-out-soft",
          visible ? "translate-y-0" : "translate-y-full",
        )
      : cn(
          "transition-[opacity,transform] duration-base ease-out-soft",
          visible ? "opacity-100 scale-100" : "opacity-0 scale-[0.96]",
        );

  const panel = (
    <div
      className={cn(
        "fixed z-50",
        isMobile
          ? "inset-x-0 bottom-0"
          : "left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 px-4",
      )}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          "mx-auto flex max-h-[85vh] flex-col overflow-hidden bg-card shadow-sheet outline-none",
          isMobile ? "rounded-t-[20px]" : "rounded-card",
          panelMotion,
          className,
        )}
      >
        {isMobile && (
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing"
          >
            <div className="h-1.5 w-10 rounded-full bg-border" aria-hidden="true" />
          </div>
        )}
        {title && (
          <h2 className="shrink-0 px-5 pb-3 pt-2 font-display text-xl text-ink">
            {title}
          </h2>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  );

  return createPortal(
    <>
      {backdrop}
      {panel}
    </>,
    document.body,
  );
}
