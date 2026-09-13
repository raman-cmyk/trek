import { useRef, useState } from "react";
import { SmartImage } from "~/components/SmartImage";

/**
 * Your own photograph, on your own profile.
 *
 * Deliberately not a form field. A photo is not something you type and save
 * with everything else — you pick it, you see it, it is done. The upload
 * happens on its own at /api/avatar, so it cannot be lost by a validation
 * error somewhere else on the page, and the picture you are looking at is
 * always the picture that is stored.
 */
export function AvatarPicker({
  initial,
  name,
  hint,
}: {
  initial: string | null;
  /** For the alt text, and so the empty state is a person rather than a box. */
  name: string;
  hint?: string;
}) {
  const [url, setUrl] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strippedGps, setStrippedGps] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(body: FormData) {
    setError(null);
    setBusy(true);
    let res: Response;
    try {
      res = await fetch("/api/avatar", { method: "POST", body });
    } catch {
      // Only a fetch that never completed is actually a lost connection.
      setError("No connection. Try again when you have signal.");
      setBusy(false);
      return;
    }
    // A reply that is not JSON came from somewhere else — a login page the
    // browser followed a redirect to, or an error page.
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    setBusy(false);
    if (!res.ok || !json) {
      setError(json?.error ?? "You have been signed out. Sign in and try again.");
      return;
    }
    setUrl(json.url ?? null);
    setStrippedGps(Boolean(json.strippedGps));
  }

  function choose(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    void send(body);
  }

  function remove() {
    const body = new FormData();
    body.append("intent", "remove");
    void send(body);
    setStrippedGps(false);
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-moss"
          aria-label={url ? "Change your photo" : "Add your photo"}
        >
          <SmartImage
            src={url ?? ""}
            alt={name}
            width={72}
            height={72}
            className="h-16 w-16 rounded-full"
          />
          <span
            className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/50 text-xs font-medium text-paper opacity-0 transition-opacity duration-quick group-hover:opacity-100"
            aria-hidden="true"
          >
            {busy ? "…" : url ? "Change" : "Add"}
          </span>
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-button border border-border px-3 py-1.5 text-sm text-ink hover:bg-mist disabled:opacity-60"
            >
              {busy ? "Uploading…" : url ? "Change photo" : "Add a photo"}
            </button>
            {url && !busy && (
              <button
                type="button"
                onClick={remove}
                className="rounded-button px-3 py-1.5 text-sm text-ink-soft hover:text-ink"
              >
                Remove
              </button>
            )}
          </div>
          {hint && !error && <p className="mt-1 text-caption text-ink-soft">{hint}</p>}
          {strippedGps && !error && (
            <p className="mt-1 text-caption text-moss">
              Saved. We removed the location the camera wrote into it.
            </p>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-ember">{error}</p>}

      {/* A plain file input the button drives — it works with a keyboard, with
          a screen reader, and with the phone camera, which a drop zone does
          not. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
