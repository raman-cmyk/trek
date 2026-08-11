import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

/**
 * The composer. This is the piece that was missing — the old thread had a
 * one-line input pinned with `sticky bottom-0` inside the marketing layout,
 * so the footer and the ridgeline wave sat on top of it and the page read as
 * having no input at all.
 *
 * Behaviour, in order of how often it matters:
 *  - Enter sends, Shift+Enter is a newline. On a phone the on-screen keyboard
 *    has no Shift, so the send button is always there too.
 *  - The textarea grows to five lines and then scrolls, measured from real
 *    line-height rather than a magic pixel number.
 *  - Optimistic: your message appears the instant you hit send, marked
 *    "sending", because on a 3G connection in Namche the round trip is long
 *    enough to make you press the button twice.
 */
export function Composer({
  action,
  disabled,
  placeholder = "Write a message…",
  prefill,
  onPrefillConsumed,
  cannedReplies,
  onOptimistic,
  masked = true,
}: {
  action?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Text pushed in from a starter chip or a canned reply. */
  prefill?: string | null;
  onPrefillConsumed?: () => void;
  cannedReplies?: { id: string; label: string; body: string }[];
  /** Called with the text so the thread can render it before the server replies. */
  onOptimistic?: (text: string) => void;
  /** Is contact masking actually active on this thread right now? */
  masked?: boolean;
}) {
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [attaching, setAttaching] = useState(false);
  const [attachMsg, setAttachMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = fetcher.state !== "idle";

  // Grow to five lines, then scroll.
  function resize() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const line = parseFloat(getComputedStyle(el).lineHeight || "20");
    const max = line * 5 + 20;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }
  useEffect(resize, [value]);

  useEffect(() => {
    if (prefill) {
      setValue(prefill);
      onPrefillConsumed?.();
      requestAnimationFrame(() => {
        areaRef.current?.focus();
        const el = areaRef.current;
        if (el) el.selectionStart = el.selectionEnd = el.value.length;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Clear only after the server confirms, so a failed send keeps the text.
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) setValue("");
  }, [fetcher.state, fetcher.data]);

  function send() {
    const text = value.trim();
    if (!text || busy || disabled) return;
    onOptimistic?.(text);
    fetcher.submit({ intent: "send", body: text }, { method: "post", action });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttaching(true);
    setAttachMsg(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/message-photo", { method: "POST", body });
      const json: any = await res.json();
      if (!res.ok) setAttachMsg(json?.error ?? "That photo didn't send.");
      else setValue((v) => (v ? v + "\n" : "") + json.url);
    } catch {
      setAttachMsg("No connection — try again when you have signal.");
    }
    setAttaching(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  const canSend = value.trim().length > 0 && !busy && !disabled;

  return (
    <div className="border-t border-line bg-card">
      {/* Trust note: a quiet system line, not a coloured banner — and only
          shown while it is TRUE. The masking it describes is real
          (app/lib/mask.ts, applied on every insert), but it stops once the
          deposit is paid, and a claim that outlives the thing it describes is
          worse than no claim. */}
      {masked && (
        <p className="flex items-start gap-1.5 px-3 pt-2 text-caption text-muted sm:px-4">
          <InfoIcon />
          <span>
            Phone numbers and emails are hidden until a deposit is paid — for
            both of you.
          </span>
        </p>
      )}

      {cannedReplies && cannedReplies.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-3 pt-2 sm:px-4">
          {cannedReplies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setValue(c.body)}
              className="shrink-0 rounded-pill border border-line bg-paper px-3 py-1 text-caption text-ink hover:border-sage"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {(fetcher.data?.error || attachMsg) && (
        <p className="px-3 pt-2 text-caption text-ember sm:px-4">
          {fetcher.data?.error ?? attachMsg}
        </p>
      )}

      <div className="flex items-end gap-2 p-3 sm:p-4">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onPickFile}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={attaching || disabled}
          aria-label="Attach a photo"
          title="Attach a photo"
          className="shrink-0 rounded-full p-2.5 text-muted hover:bg-mist hover:text-ink disabled:opacity-40"
        >
          {attaching ? <Spinner /> : <ClipIcon />}
        </button>

        <textarea
          ref={areaRef}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
          className="max-h-40 flex-1 resize-none rounded-lg border border-line bg-paper px-3 py-2.5 text-base leading-6 text-ink outline-none focus:border-moss disabled:opacity-60"
        />

        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Send"
          className="shrink-0 rounded-full bg-moss p-2.5 text-white transition-opacity hover:bg-pine disabled:cursor-not-allowed disabled:opacity-30"
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4M8 5.1v.1" strokeLinecap="round" />
    </svg>
  );
}
function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8-8a3.5 3.5 0 0 1 5 5l-8 8a2 2 0 0 1-3-3l7.5-7.5" />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12 20 4l-8 16-2-6-6-2Z" />
    </svg>
  );
}
function Spinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}
