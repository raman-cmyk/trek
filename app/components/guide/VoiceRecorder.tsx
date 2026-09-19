import { useEffect, useRef, useState } from "react";
import {
  TARGET_SECONDS,
  baseType,
  MAX_SECONDS,
  clock,
  micProblem,
  pickRecordingType,
  recordingFilename,
  recordingProblem,
} from "~/lib/voice-recording";

/**
 * Record a voice introduction without leaving the page.
 *
 * "Record one" was the label on a plain file picker. **4 of 56 guides had a
 * voice intro**, for the field the card itself calls the strongest thing on a
 * profile — and the founder's note was simply "there is no option to record
 * the voice in app".
 *
 * This is an ADDITION, not a replacement. The file picker beside it opens the
 * phone's own voice-memo app, which a guide already knows and which needs no
 * microphone permission inside a web page — the original reasoning, still
 * sound, and the only path that works when permission is refused.
 *
 * Three rules it has to obey:
 *
 *  - **Nothing breaks on the server.** SSR is non-negotiable here and there is
 *    no ClientOnly wrapper in this repo, so support is decided in an effect
 *    after mount and the component renders nothing until it knows. Compare
 *    `AscentStats`, which feature-detects the same way.
 *  - **Nothing is hidden behind hydration.** `SmartImage` once rendered a
 *    control at opacity 0 on the server and left it invisible where
 *    JavaScript never arrived. The file picker is never inside this
 *    component, so a guide whose JS fails still has a way to send a file.
 *  - **The blob is named for what it is.** The upload route defaults a
 *    typeless file to `audio/mpeg`, so a bare blob would be stored as an mp3
 *    whatever it actually was.
 */
export function VoiceRecorder({
  onRecorded,
  disabled,
}: {
  /** Handed a File ready to POST to /api/guide-voice. */
  onRecorded: (file: File) => void;
  disabled?: boolean;
}) {
  const [mime, setMime] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ url: string; file: File } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const startedAt = useRef(0);

  // Decided after mount: none of this exists on the server, and on a browser
  // that cannot record we render nothing at all rather than a dead button.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("MediaRecorder" in window) ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setReady(true);
      return;
    }
    setMime(pickRecordingType((t) => MediaRecorder.isTypeSupported(t)));
    setReady(true);
  }, []);

  // Let go of the microphone and the object URL whatever happens — a page
  // left with a live stream keeps the recording light on, which is alarming.
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      // A hard stop, so a phone in a pocket cannot record for an hour.
      if (s >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [recording]);

  async function start() {
    if (!mime) return;
    setProblem(null);
    if (preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const rec = new MediaRecorder(media, { mimeType: mime });
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        const took = Math.round((Date.now() - startedAt.current) / 1000);
        media.getTracks().forEach((t) => t.stop());
        stream.current = null;
        setRecording(false);
        // `rec.mimeType` rather than what we asked for: a browser may hand
        // back something adjacent, and the stored file must match its bytes.
        //
        // Stripped of its codec parameter before it becomes the file's type.
        // Chromium reports `audio/webm;codecs=opus`, and both the upload
        // route's allow-list and the bucket's `allowed_mime_types` hold bare
        // types — so the full string was refused with "Sound files only" and
        // the recording died on the way out. The bytes are unchanged; the
        // codec is optional metadata, not part of what we store.
        const reported = rec.mimeType || mime;
        const type = baseType(reported) || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const bad = recordingProblem(took, blob.size);
        if (bad) {
          setProblem(bad);
          return;
        }
        const file = new File([blob], recordingFilename(type), { type });
        setPreview({ url: URL.createObjectURL(blob), file });
      };
      startedAt.current = Date.now();
      setSeconds(0);
      rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch (e) {
      setProblem(micProblem((e as { name?: string })?.name ?? ""));
    }
  }

  if (!ready || !mime) return null;

  const over = seconds > TARGET_SECONDS;

  return (
    <div className="space-y-2 rounded-button border border-border bg-paper p-3">
      {!recording && !preview && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-button bg-pine px-4 py-3 text-base font-medium text-paper disabled:opacity-50"
        >
          <Mic /> Record here
        </button>
      )}

      {recording && (
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span aria-hidden className="h-2.5 w-2.5 animate-pulse rounded-full bg-ember" />
            <span className="font-mono text-lg text-ink" role="timer" aria-live="off">
              {clock(seconds)}
            </span>
          </div>
          <p className="text-center text-caption text-muted">
            {over ? "That is about a minute — wrap up when you like." : "Say your name, where you are from, and one thing a trekker should know."}
          </p>
          <button
            type="button"
            onClick={() => recorder.current?.stop()}
            className="w-full rounded-button border border-moss px-4 py-2.5 text-sm font-medium text-moss"
          >
            Stop
          </button>
        </div>
      )}

      {preview && (
        <div className="space-y-2">
          {/* Heard before it is sent — the whole point of keeping the
              preview step rather than uploading the moment you stop. */}
          <audio controls src={preview.url} className="w-full" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onRecorded(preview.file)}
              disabled={disabled}
              className="flex-1 rounded-button bg-pine px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
            >
              Use this one
            </button>
            <button
              type="button"
              onClick={start}
              disabled={disabled}
              className="rounded-button border border-border px-4 py-2.5 text-sm text-ink"
            >
              Record again
            </button>
          </div>
        </div>
      )}

      {problem && <p className="text-sm text-ember">{problem}</p>}
    </div>
  );
}

function Mic() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
    </svg>
  );
}
