import { useCallback, useRef, useState } from "react";
import { cn } from "~/lib/cn";
import { isVideo, type JournalPhoto } from "~/lib/journals";

/**
 * Pick a day's photos on a phone, and see them.
 *
 * The old version was an upload button that appended URLs into a textarea,
 * plus four checkboxes labelled "photo 1 … photo 4" for the consent flag. To
 * mark the third photo you had to count lines in a textarea of https:// —
 * which is not something a guide standing in a lodge is going to do, so the
 * flag mostly never got set.
 *
 * This shows the photographs. Add them, drag or nudge them into order, tap one
 * to say a client is in it, tap × to drop it. The whole list serialises into a
 * single hidden JSON field, so the form is still an ordinary POST that works
 * with a dropped connection.
 */
export function MediaPicker({
  name,
  initial,
  guideId,
  onChange,
}: {
  /** Hidden input name — the server parses this as JSON. */
  name: string;
  initial?: JournalPhoto[];
  guideId?: string;
  /** Fires on every change, so a parent can autosave. */
  onChange?: () => void;
}) {
  const [items, setItems] = useState<JournalPhoto[]>(initial ?? []);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [strippedGps, setStrippedGps] = useState(false);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (next: JournalPhoto[]) => {
      setItems(next);
      // The parent autosaves off this; it fires after the state the form will
      // actually submit, not before.
      queueMicrotask(() => onChange?.());
    },
    [onChange],
  );

  async function add(files: File[]) {
    if (!files.length) return;
    setError(null);
    setBusy({ done: 0, total: files.length });
    // One at a time on purpose: a dropped connection on lodge wifi costs the
    // photo in flight, not the whole set.
    const added: JournalPhoto[] = [];
    for (const [i, file] of files.entries()) {
      setBusy({ done: i, total: files.length });
      const body = new FormData();
      body.append("file", file);
      if (guideId) body.append("guide_id", guideId);
      try {
        const res = await fetch("/api/journal-photo", { method: "POST", body });
        const json: any = await res.json();
        if (!res.ok) {
          setError(json?.error ?? "That one didn't send. Try again.");
          break;
        }
        if (json.strippedGps) setStrippedGps(true);
        added.push({ url: json.url, kind: "photo" });
      } catch {
        setError("No connection. It will still be here when you have signal.");
        break;
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
    if (added.length) update([...items, ...added]);
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    const next = [...items];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    update(next);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(items)} />

      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((m, i) => (
            <li
              key={m.url + i}
              draggable
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom != null) move(dragFrom, i);
                setDragFrom(null);
              }}
              className={cn(
                "group relative overflow-hidden rounded border border-line bg-mist",
                dragFrom === i && "opacity-50",
              )}
            >
              <div className="aspect-square">
                {isVideo(m) ? (
                  <video src={m.url} className="h-full w-full object-cover" muted playsInline />
                ) : (
                  <img src={m.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>

              {/* Order. Arrows as well as drag, because drag on a touchscreen
                  inside a scrolling page is a fight. */}
              <div className="absolute left-1 top-1 flex gap-1">
                <TinyButton label="Move earlier" onClick={() => move(i, i - 1)} disabled={i === 0}>
                  ←
                </TinyButton>
                <TinyButton
                  label="Move later"
                  onClick={() => move(i, i + 1)}
                  disabled={i === items.length - 1}
                >
                  →
                </TinyButton>
              </div>
              <TinyButton
                label="Remove this photo"
                onClick={() => update(items.filter((_, k) => k !== i))}
                className="absolute right-1 top-1"
              >
                ×
              </TinyButton>

              {/* Consent, on the photograph it belongs to. */}
              <button
                type="button"
                onClick={() =>
                  update(items.map((x, k) => (k === i ? { ...x, people: !x.people } : x)))
                }
                aria-pressed={!!m.people}
                className={cn(
                  "absolute inset-x-0 bottom-0 px-1.5 py-1 text-left text-[11px] leading-tight transition-colors",
                  m.people
                    ? "bg-moss text-paper"
                    : "bg-black/45 text-paper/85 hover:bg-black/65",
                )}
              >
                {m.people ? "✓ A client is in this" : "A client is in this?"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/")));
        }}
        className={cn(
          "flex cursor-pointer items-center justify-center rounded border border-dashed border-line px-4 py-5 text-center text-sm transition-colors hover:border-sage hover:bg-mist",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => add(Array.from(e.target.files ?? []))}
        />
        <span>
          {busy ? (
            <>
              Sending photo <span className="font-mono">{busy.done + 1}</span> of{" "}
              <span className="font-mono">{busy.total}</span>…
            </>
          ) : items.length ? (
            <span className="font-medium text-moss">Add more photos</span>
          ) : (
            <>
              <span className="font-medium text-moss">Add photos from your phone</span>
              <span className="mt-0.5 block text-caption text-muted">
                Pick as many as you like. They upload as you go.
              </span>
            </>
          )}
        </span>
      </label>

      {error && <p className="text-sm text-ember">{error}</p>}
      {strippedGps && (
        <p className="text-caption text-muted">
          We removed the location from your photos before saving. The date stays
          — that is how the office checks a journal is the trek it says it is.
        </p>
      )}
    </div>
  );
}

function TinyButton({
  children,
  label,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid h-6 w-6 place-items-center rounded bg-black/55 text-sm leading-none text-paper transition-opacity hover:bg-black/75 disabled:opacity-25",
        className,
      )}
    >
      {children}
    </button>
  );
}
