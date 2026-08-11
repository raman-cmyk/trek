import { useCallback, useEffect, useRef, useState } from "react";
import { isVideo, type JournalPhoto } from "~/lib/journals";

export type GalleryItem = JournalPhoto & { day?: number; dayTitle?: string };

/**
 * Full-screen media viewer for a journal.
 *
 * Every frame in the trek is one list, so opening day 9's photo and pressing
 * → walks you into day 10 — the album reads the way a person flicks through
 * someone's phone, not the way a CMS paginates.
 *
 * Deliberately not a library: this needs to work on a cheap Android over 3G,
 * and a 40 kB carousel dependency to show an <img> is exactly the trade we
 * keep refusing.
 */
export function Lightbox({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: GalleryItem[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const touchX = useRef<number | null>(null);
  const n = items.length;
  const item = items[index];

  const go = useCallback(
    (delta: number) => onIndex((index + delta + n) % n),
    [index, n, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the viewer is open, or closing it
    // drops you somewhere you never navigated to.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    wrap.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  // Warm the neighbours so → feels instant rather than showing a blank frame.
  useEffect(() => {
    for (const d of [1, -1]) {
      const next = items[(index + d + n) % n];
      if (next && !isVideo(next)) {
        const img = new Image();
        img.src = next.url;
      }
    }
  }, [index, items, n]);

  if (!item) return null;

  return (
    <div
      ref={wrap}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Photo ${index + 1} of ${n}`}
      className="fixed inset-0 z-50 flex flex-col bg-[#0d1f16]/98 outline-none backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-paper">
        <p className="font-mono text-sm text-paper/70">
          {String(index + 1).padStart(2, "0")}
          <span className="text-paper/40"> / {String(n).padStart(2, "0")}</span>
          {item.day != null && (
            <span className="ml-3 text-paper/70">Day {item.day}</span>
          )}
        </p>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-2 text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 sm:px-14">
        {n > 1 && (
          <>
            <Arrow dir="left" onClick={() => go(-1)} />
            <Arrow dir="right" onClick={() => go(1)} />
          </>
        )}
        {isVideo(item) ? (
          <video
            key={item.url}
            src={item.url}
            poster={item.poster}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded-sm"
          />
        ) : (
          <img
            key={item.url}
            src={item.url}
            alt={item.alt ?? item.dayTitle ?? ""}
            className="max-h-full max-w-full rounded-sm object-contain"
          />
        )}
      </div>

      <div className="shrink-0 px-4 pb-3 pt-3">
        {(item.caption || item.dayTitle) && (
          <p className="mx-auto max-w-[70ch] text-center text-sm text-paper/85">
            {item.caption ?? item.dayTitle}
          </p>
        )}
        {n > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {items.map((it, i) => (
              <button
                key={it.url + i}
                onClick={() => onIndex(i)}
                aria-label={`Go to ${i + 1}`}
                aria-current={i === index}
                className={
                  "relative h-12 w-16 shrink-0 overflow-hidden rounded-sm transition-opacity " +
                  (i === index
                    ? "opacity-100 ring-2 ring-chartreuse"
                    : "opacity-45 hover:opacity-80")
                }
              >
                <img
                  src={isVideo(it) ? (it.poster ?? it.url) : it.url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {isVideo(it) && (
                  <span className="absolute inset-0 grid place-items-center bg-pine/40">
                    <PlayGlyph className="h-4 w-4 text-paper" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Arrow({ dir, onClick }: { dir: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={dir === "left" ? "Previous" : "Next"}
      className={
        "absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-pine/60 p-2.5 text-paper " +
        "transition-colors hover:bg-pine sm:p-3 " +
        (dir === "left" ? "left-1 sm:left-2" : "right-1 sm:right-2")
      }
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path
          d={dir === "left" ? "M12.5 4L6.5 10l6 6" : "M7.5 4l6 6-6 6"}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

export function PlayGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M8 5.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

/** Open-on-click state, shared by the journal page and the gallery grid. */
export function useLightbox(items: GalleryItem[]) {
  const [index, setIndex] = useState<number | null>(null);
  return {
    open: (i: number) => setIndex(i),
    node:
      index == null ? null : (
        <Lightbox
          items={items}
          index={index}
          onIndex={setIndex}
          onClose={() => setIndex(null)}
        />
      ),
  };
}
