import { describe, expect, it } from "vitest";
import {
  MAX_SECONDS,
  baseType,
  clock,
  extensionFor,
  micProblem,
  pickRecordingType,
  recordingFilename,
  recordingProblem,
} from "./voice-recording";

describe("pickRecordingType", () => {
  it("prefers webm/opus, which is what Android Chrome records", () => {
    expect(pickRecordingType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to mp4 on Safari, which supports nothing else", () => {
    expect(pickRecordingType((t) => t === "audio/mp4")).toBe("audio/mp4");
  });

  it("is null when the browser can record nothing we could store", () => {
    // Better to leave the file picker as the only path than to record
    // something the server will refuse after the guide has spoken.
    expect(pickRecordingType(() => false)).toBeNull();
    expect(pickRecordingType((t) => t === "audio/flac")).toBeNull();
  });
});

describe("naming the file for what it is", () => {
  it("strips the codec parameter", () => {
    expect(baseType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseType("AUDIO/MP4")).toBe("audio/mp4");
    expect(baseType("")).toBe("");
  });

  it("gives each type the extension its bytes deserve", () => {
    expect(extensionFor("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionFor("audio/mp4")).toBe("m4a");
    expect(extensionFor("audio/ogg;codecs=opus")).toBe("ogg");
  });

  it("is the bare type the server will accept, codec parameter and all", () => {
    // Chromium reports `audio/webm;codecs=opus`. The upload route and the
    // bucket both hold BARE types, so handing the full string over as the
    // file's MIME was refused with "Sound files only" and the recording was
    // lost on the way out. Caught in a real browser, pinned here.
    const SERVER_ACCEPTS = new Set([
      "audio/mpeg", "audio/mp4", "audio/m4a", "audio/x-m4a",
      "audio/aac", "audio/wav", "audio/webm", "audio/ogg",
    ]);
    for (const reported of ["audio/webm;codecs=opus", "audio/ogg; codecs=opus", "audio/mp4"]) {
      expect(SERVER_ACCEPTS.has(baseType(reported))).toBe(true);
    }
    expect(SERVER_ACCEPTS.has("audio/webm;codecs=opus")).toBe(false);
  });

  it("names a recording so the upload cannot mislabel it", () => {
    // The upload route defaults a typeless file to audio/mpeg, so a bare
    // blob would be stored as an mp3 whatever it actually was.
    expect(recordingFilename("audio/webm;codecs=opus")).toBe("voice-intro.webm");
    expect(recordingFilename("audio/mp4")).toBe("voice-intro.m4a");
  });
});

describe("clock", () => {
  it("reads as a timer while you are talking", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(7)).toBe("0:07");
    expect(clock(75)).toBe("1:15");
  });

  it("never shows a negative or a fraction", () => {
    expect(clock(-3)).toBe("0:00");
    expect(clock(9.8)).toBe("0:09");
  });
});

describe("recordingProblem", () => {
  it("is quiet about a normal one-minute recording", () => {
    expect(recordingProblem(58, 400_000)).toBeNull();
  });

  it("catches a tap that recorded nothing", () => {
    expect(recordingProblem(1, 200)).toContain("too short");
    expect(recordingProblem(10, 0)).toContain("Nothing was recorded");
  });

  it("catches one that ran away", () => {
    expect(recordingProblem(MAX_SECONDS + 1, 500_000)).toContain("over two minutes");
  });

  it("catches one the server would refuse", () => {
    expect(recordingProblem(70, 9 * 1024 * 1024)).toContain("over 8 MB");
  });
});

describe("micProblem", () => {
  it("tells a guide who refused permission where the setting is", () => {
    expect(micProblem("NotAllowedError")).toContain("site settings");
  });

  it("names the other real cases", () => {
    expect(micProblem("NotFoundError")).toContain("could not find a microphone");
    expect(micProblem("NotReadableError")).toContain("Something else is using");
  });

  it("always offers the file picker as the way out", () => {
    // The recorder is an addition; the file picker is the path that works on
    // every handset, and no failure should leave a guide with nothing to do.
    for (const name of ["NotAllowedError", "NotFoundError", "AbortError", "Whatever"]) {
      expect(micProblem(name).toLowerCase()).toMatch(/file|try again/);
    }
  });
});
