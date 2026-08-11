import { useRef, useState } from "react";

/**
 * Pick photos on a phone, get URLs back.
 *
 * Uploads one at a time and appends each returned URL into the day block's
 * textarea, so a dropped connection costs one photo and not the whole set —
 * which is the normal case on a lodge wifi at 4,000 m.
 *
 * The server strips the GPS out of the EXIF before storing (app/lib/exif.ts);
 * we say so here rather than silently, because a guide uploading a photo of a
 * client's house should know what we did and did not keep.
 */
export function PhotoUpload({
  targetId,
  guideId,
}: {
  /** id of the textarea holding one URL per line. */
  targetId: string;
  guideId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [strippedAny, setStrippedAny] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setMsg(null);
    const area = document.getElementById(targetId) as HTMLTextAreaElement | null;

    for (const [i, file] of files.entries()) {
      setMsg(`Sending photo ${i + 1} of ${files.length}…`);
      const body = new FormData();
      body.append("file", file);
      if (guideId) body.append("guide_id", guideId);
      try {
        const res = await fetch("/api/journal-photo", { method: "POST", body });
        const json: any = await res.json();
        if (!res.ok) {
          setMsg(json?.error ?? "That one didn't send. Try again.");
          break;
        }
        if (json.strippedGps) setStrippedAny(true);
        if (area) {
          area.value = (area.value.trim() ? area.value.trim() + "\n" : "") + json.url;
        }
      } catch {
        setMsg("No connection. Try again when you have signal.");
        break;
      }
    }

    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    setMsg((m) => (m && m.startsWith("Sending") ? "Added. Now press Save day." : m));
  }

  return (
    <div className="rounded border border-line p-3">
      <label className="block text-sm text-ink-soft">
        Add photos from your phone
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={busy}
          onChange={onPick}
          className="mt-1 block w-full text-sm file:mr-3 file:rounded file:border-0 file:bg-mist file:px-3 file:py-2 file:text-sm file:text-ink"
        />
      </label>
      {msg && <p className="mt-2 text-sm text-ink">{msg}</p>}
      <p className="mt-2 text-caption text-muted">
        {strippedAny
          ? "We removed the map location from your photos. The date stays."
          : "We remove the map location from every photo. The date stays."}
      </p>
    </div>
  );
}
