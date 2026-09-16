import { useRef, useState } from "react";
import { cn } from "~/lib/cn";

/**
 * A document, from the camera in their hand.
 *
 * Three things a plain `<input type="file">` gets wrong for this page:
 *
 *   1. On Android it opens a file browser, when what the guide has is the
 *      card on the table in front of them. `capture` opens the camera.
 *   2. A modern phone camera produces a 4MB JPEG. On the connection this
 *      page is used over that is a minute of upload and a good chance of a
 *      failure, and the office only needs to read a licence number — so the
 *      image is redrawn at 1600px and re-encoded before it ever leaves the
 *      handset.
 *   3. It gives no sign anything happened. A thumbnail with a stamp on it is
 *      how you know the photograph was the right one.
 *
 * Compression is best-effort: if canvas or the codec refuses, the original
 * file goes as it is. A slow upload beats a blocked application.
 */
const MAX_EDGE = 1600;
const COMPRESS_OVER = 400 * 1024;

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= COMPRESS_OVER) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.82),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function DocUpload({
  name,
  label,
  hint,
  cta,
  receivedLabel,
  retryLabel,
  glyph,
}: {
  name: string;
  label: string;
  hint?: string;
  cta: string;
  receivedLabel: string;
  retryLabel: string;
  /** A line drawing of the document being asked for. */
  glyph: "licence" | "id";
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [size, setSize] = useState<{ before: number; after: number } | null>(null);
  const [working, setWorking] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWorking(true);
    const small = await shrink(file);
    if (small !== file && ref.current) {
      // Put the smaller file back into the input so the form posts that one.
      const dt = new DataTransfer();
      dt.items.add(small);
      ref.current.files = dt.files;
    }
    setSize({ before: file.size, after: small.size });
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return small.type.startsWith("image/") ? URL.createObjectURL(small) : null;
    });
    setWorking(false);
  };

  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

  return (
    <div>
      <p className="text-ink">{label}</p>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}

      <label
        className={cn(
          "mt-2 flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed border-sage/70 bg-mist/40 p-4 transition-colors duration-instant",
          "hover:border-moss hover:bg-mist focus-within:border-moss focus-within:ring-2 focus-within:ring-moss/30",
        )}
      >
        {preview ? (
          // The thumbnail on a slightly turned paper card, with a stamp.
          <span className="relative block shrink-0 -rotate-2">
            <img
              src={preview}
              alt=""
              className="h-20 w-28 rounded bg-paper object-cover p-1 shadow-lift"
            />
            <span className="absolute -bottom-1.5 -right-1.5 rounded-pill bg-moss px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-paper">
              ✓ {receivedLabel}
            </span>
          </span>
        ) : (
          <span aria-hidden="true" className="shrink-0 text-sage">
            {glyph === "licence" ? (
              <svg viewBox="0 0 40 28" className="h-12 w-16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="38" height="26" rx="3" />
                <circle cx="11" cy="11" r="4" />
                <path d="M4 23c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5M22 9h13M22 14h13M22 19h9" />
              </svg>
            ) : (
              <svg viewBox="0 0 40 28" className="h-12 w-16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="38" height="26" rx="3" />
                <path d="M6 7h12M6 12h12M6 17h8M24 8h10v12H24z" />
              </svg>
            )}
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">
            {working ? "…" : preview ? retryLabel : cta}
          </span>
          {size && (
            <span className="mt-0.5 block font-mono text-caption text-muted">
              {size.after < size.before
                ? `${kb(size.before)} → ${kb(size.after)}, made smaller for a slow connection`
                : kb(size.after)}
            </span>
          )}
        </span>

        <input
          ref={ref}
          type="file"
          name={name}
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          onChange={onPick}
          className="sr-only"
        />
      </label>
    </div>
  );
}
