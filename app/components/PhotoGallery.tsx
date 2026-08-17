import { useEffect, useRef, useState } from "react";

/**
 * The photographs for an experience.
 *
 * A trip had one cover photo and nothing else, which is why 53 of 56 listings
 * show a single picture: there was no way to add a second. A listing with one
 * photograph does not sell, so this takes several at once off a phone's camera
 * roll, uploads them one at a time with the count visible, and lets the guide
 * drag them into the order they want. The first is the cover — stated, not
 * hidden in a separate field.
 *
 * Uploads go through /api/journal-photo, which strips the GPS out of the EXIF
 * before anything is stored.
 */

export interface GalleryPhoto {
  url: string;
  alt: string;
}

export function PhotoGallery({
  initial,
  guideId,
  min = 3,
  onCount,
}: {
  initial: GalleryPhoto[];
  guideId: string;
  min?: number;
  /** So the review step can say how many there are without owning the list. */
  onCount?: (n: number) => void;
}) {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(initial);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => onCount?.(photos.length), [photos.length, onCount]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function take(files: FileList) {
    const list = Array.from(files);
    setErr(null);
    setBusy({ done: 0, total: list.length });
    const added: GalleryPhoto[] = [];
    for (let i = 0; i < list.length; i++) {
      const body = new FormData();
      body.append("file", list[i]);
      body.append("guide_id", guideId);
      try {
        const res = await fetch("/api/journal-photo", { method: "POST", body });
        const json: any = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "That photo didn't send.");
        added.push({ url: json.url, alt: "" });
      } catch (e: any) {
        // One bad photo out of six should not lose the other five.
        setErr(e.message ?? "One photo didn't send. The others are here.");
      }
      setBusy({ done: i + 1, total: list.length });
    }
    setPhotos((p) => [...p, ...added]);
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const move = (from: number, to: number) =>
    setPhotos((p) => {
      const n = [...p];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x);
      return n;
    });

  return (
    <div className="rounded-md border border-line bg-card p-4">
      <input type="hidden" name="photos" value={JSON.stringify(photos)} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">Photographs</p>
        <p className="text-caption text-muted">
          <span className="font-mono">{photos.length}</span>
          {photos.length < min ? ` of ${min} needed` : " — first one is the cover"}
        </p>
      </div>

      {photos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {photos.map((p, i) => (
            <li
              key={p.url}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag !== null && drag !== i) move(drag, i);
                setDrag(null);
              }}
              className="flex gap-2 rounded border border-line bg-paper p-2"
            >
              <div className="relative shrink-0">
                <img src={p.url} alt="" className="h-16 w-20 rounded object-cover" />
                {i === 0 && (
                  <span className="absolute left-0.5 top-0.5 rounded bg-pine px-1 text-[10px] font-semibold text-paper">
                    Cover
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <input
                  aria-label={`What is in photo ${i + 1}`}
                  value={p.alt}
                  onChange={(e) =>
                    setPhotos((all) =>
                      all.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)),
                    )
                  }
                  placeholder="Say what it shows (helps people find you)"
                  className="w-full rounded border border-line bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-moss"
                />
                <div className="mt-1.5 flex items-center gap-3 text-caption">
                  {/* Buttons as well as drag: dragging a list item is fiddly
                      on a phone and impossible with a keyboard. */}
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                    className="text-moss disabled:opacity-30"
                  >
                    ↑ up
                  </button>
                  <button
                    type="button"
                    disabled={i === photos.length - 1}
                    onClick={() => move(i, i + 1)}
                    className="text-moss disabled:opacity-30"
                  >
                    ↓ down
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotos((all) => all.filter((_, j) => j !== i))}
                    className="ml-auto text-ember"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-3 block cursor-pointer rounded-md border border-dashed border-line bg-paper p-4 text-center text-sm text-ink-soft hover:border-sage">
        {busy ? `Sending ${busy.done} of ${busy.total}…` : "Add photos — you can pick several"}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files?.length && take(e.target.files)}
        />
      </label>
      {err && <p className="mt-2 rounded bg-ember/10 px-3 py-2 text-sm text-ember">{err}</p>}
      {photos.length < min && (
        <p className="mt-2 text-caption text-muted">
          A trip with one photograph does not sell. {min} is the minimum before
          you can send it in.
        </p>
      )}
    </div>
  );
}
