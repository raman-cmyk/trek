import { describe, expect, it } from "vitest";
import { isJpeg, stripGps , sniffImage } from "./exif";

/**
 * Builds a minimal but structurally real JPEG: SOI, an APP1/Exif segment with
 * a one- or two-entry IFD0, then SOS. Enough for the stripper to walk.
 */
function jpegWithExif({ gps }: { gps: boolean }) {
  const entries: { tag: number; value: number }[] = [
    { tag: 0x0132, value: 0x11223344 }, // DateTime pointer-ish; just a payload
  ];
  if (gps) entries.push({ tag: 0x8825, value: 0x0000004a });

  const ifdLen = 2 + entries.length * 12 + 4;
  const tiffLen = 8 + ifdLen;
  const exifLen = 6 + tiffLen;
  const segLen = 2 + exifLen;

  const out = new Uint8Array(2 + 2 + segLen + 2);
  const v = new DataView(out.buffer);
  let p = 0;
  v.setUint16(p, 0xffd8); p += 2; // SOI
  v.setUint16(p, 0xffe1); p += 2; // APP1
  v.setUint16(p, segLen); p += 2;
  out.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], p); p += 6; // "Exif\0\0"

  const tiff = p;
  v.setUint16(p, 0x4d4d); p += 2; // big-endian
  v.setUint16(p, 42); p += 2;
  v.setUint32(p, 8); p += 4; // IFD0 at tiff+8
  v.setUint16(p, entries.length); p += 2;
  for (const e of entries) {
    v.setUint16(p, e.tag); p += 2;
    v.setUint16(p, 4); p += 2; // LONG
    v.setUint32(p, 1); p += 4;
    v.setUint32(p, e.value); p += 4;
  }
  v.setUint32(p, 0); p += 4; // next IFD
  v.setUint16(p, 0xffda); // SOS
  return { bytes: out, tiff };
}

describe("stripGps", () => {
  it("blanks the GPS IFD pointer and reports it", () => {
    const { bytes } = jpegWithExif({ gps: true });
    const before = new Uint8Array(bytes);
    const r = stripGps(bytes);
    expect(r.understood).toBe(true);
    expect(r.strippedGps).toBe(true);
    expect(before).not.toEqual(r.bytes);
    // Second pass finds nothing left to strip.
    expect(stripGps(r.bytes).strippedGps).toBe(false);
  });

  it("leaves a photo with no GPS untouched", () => {
    const { bytes } = jpegWithExif({ gps: false });
    const before = new Uint8Array(bytes);
    const r = stripGps(bytes);
    expect(r.understood).toBe(true);
    expect(r.strippedGps).toBe(false);
    expect(r.bytes).toEqual(before);
  });

  it("keeps the other EXIF tags — the dates are how we check a journal", () => {
    const { bytes } = jpegWithExif({ gps: true });
    const r = stripGps(bytes);
    const v = new DataView(r.bytes.buffer, r.bytes.byteOffset, r.bytes.byteLength);
    // SOI(2) + APP1(2) + len(2) + "Exif\0\0"(6) = TIFF at 12; IFD0 at 20;
    // first entry at 22, its 4-byte value at +8.
    expect(v.getUint32(30)).toBe(0x11223344);
  });

  it("refuses to claim it understood a non-JPEG", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    expect(isJpeg(png)).toBe(false);
    expect(stripGps(png).understood).toBe(false);
  });

  it("does not run off the end of a truncated file", () => {
    const { bytes } = jpegWithExif({ gps: true });
    const cut = bytes.slice(0, 12);
    expect(() => stripGps(cut)).not.toThrow();
  });
});

describe("what a file actually is", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(24).fill(0)]);
  const ascii = (s: string, pad = 0) =>
    new Uint8Array([...new Array(pad).fill(0), ...[...s].map((c) => c.charCodeAt(0)), ...new Array(24).fill(0)]);

  it("reads the format from the bytes, not the browser's guess", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffImage(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("gif");
  });

  it("knows a WebP from the RIFF container it lives in", () => {
    const b = new Uint8Array(32);
    b.set([...("RIFF")].map((c) => c.charCodeAt(0)), 0);
    b.set([...("WEBP")].map((c) => c.charCodeAt(0)), 8);
    expect(sniffImage(b)).toBe("webp");
  });

  it("names HEIC rather than calling an iPhone photo unreadable", () => {
    for (const brand of ["heic", "heix", "mif1"]) {
      const b = new Uint8Array(32);
      b.set([...("ftyp")].map((c) => c.charCodeAt(0)), 4);
      b.set([...brand].map((c) => c.charCodeAt(0)), 8);
      expect(sniffImage(b)).toBe("heic");
    }
  });

  it("does not mistake a text file for a photograph", () => {
    expect(sniffImage(ascii("Dear Pemba, about October"))).toBe("unknown");
    expect(sniffImage(new Uint8Array(0))).toBe("unknown");
  });
});
