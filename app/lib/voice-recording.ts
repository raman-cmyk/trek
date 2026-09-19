/**
 * Recording a voice introduction in the browser.
 *
 * The rules, kept out of the component so they can be tested without a
 * microphone — which is the only way to test them at all, since neither
 * `MediaRecorder` nor `getUserMedia` exists in a test runner or on the
 * server.
 *
 * Why this exists: the voice card said "Record one" above a plain file
 * picker, and **4 of 56 guides had a voice intro** for the field the page
 * itself calls the strongest thing on a profile. The file picker stays — it
 * opens the phone's own voice-memo app, which needs no microphone permission
 * inside a web page — and the recorder is added beside it.
 */

/**
 * What to ask `MediaRecorder` for, in order of preference.
 *
 * These are exactly the types the upload route and the `guide-audio` bucket
 * already accept (`api.guide-voice.tsx`, migration 0045), so a recording
 * needs no migration and no server change. webm/opus is what Chrome and
 * Android produce; mp4 is Safari and iOS.
 */
export const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** Types the server will store, stripped of any codec parameter. */
const ACCEPTED = new Set(["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/aac"]);

/** `audio/webm;codecs=opus` → `audio/webm`. */
export function baseType(mime: string): string {
  return (mime || "").split(";")[0]!.trim().toLowerCase();
}

/**
 * The first type this browser can record that the server will also accept.
 *
 * `null` means record nothing rather than produce a file that will be
 * refused after the guide has already spoken into their phone.
 */
export function pickRecordingType(
  isSupported: (mime: string) => boolean,
): string | null {
  for (const t of RECORDING_TYPES) {
    if (isSupported(t) && ACCEPTED.has(baseType(t))) return t;
  }
  return null;
}

/** The file extension to store it under, so the name and the bytes agree. */
export function extensionFor(mime: string): string {
  const base = baseType(mime);
  if (base === "audio/mp4" || base === "audio/aac") return "m4a";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mpeg") return "mp3";
  return "webm";
}

/**
 * Name the recording for what it is.
 *
 * The upload route defaults a file with no type to `audio/mpeg`, so a blob
 * handed over bare would be stored as an mp3 whatever it actually is. The
 * caller must always wrap it in a `File` carrying this name and the explicit
 * type from `MediaRecorder.mimeType`.
 */
export function recordingFilename(mime: string): string {
  return `voice-intro.${extensionFor(mime)}`;
}

/** About a minute, says the copy. This is what "about" means. */
export const TARGET_SECONDS = 60;
export const MAX_SECONDS = 120;

/** "0:07", "1:15" — a timer a guide can read while they are talking. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Anything wrong with what they just recorded, in plain words.
 *
 * Length first, because it is the one a guide can do something about; size
 * second, because at these bitrates only a very long recording reaches 8 MB
 * and the server would refuse it anyway.
 */
export function recordingProblem(seconds: number, bytes: number): string | null {
  if (seconds < 3) return "That was too short to hear. Try again and say your name.";
  if (seconds > MAX_SECONDS) return "That is over two minutes. Keep it to about one.";
  if (bytes > 8 * 1024 * 1024) return "That recording is over 8 MB. Keep it to about a minute.";
  if (bytes === 0) return "Nothing was recorded. Check your microphone and try again.";
  return null;
}

/**
 * What to say when the browser refuses the microphone.
 *
 * `getUserMedia` rejects with a `DOMException` whose `name` is the only
 * reliable part; the message is browser-specific and often untranslated. A
 * guide who has denied permission needs to be told where the setting is, not
 * that a promise rejected.
 */
export function micProblem(errName: string): string {
  if (errName === "NotAllowedError" || errName === "SecurityError") {
    return "Your phone did not let us use the microphone. Allow it in the browser's site settings, or record with your phone's voice recorder and send the file instead.";
  }
  if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
    return "We could not find a microphone on this device. Send a file instead.";
  }
  if (errName === "NotReadableError" || errName === "TrackStartError") {
    return "Something else is using the microphone. Close other apps and try again.";
  }
  return "We could not start recording. Send a file instead.";
}
