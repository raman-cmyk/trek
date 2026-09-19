import { describe, expect, it } from "vitest";
import { isJpeg, sanitizeImage, stripGps } from "./exif";

function segment(marker: number, payload: number[]) {
  const out = new Uint8Array(payload.length + 4);
  out.set([0xff, marker, 0, payload.length + 2]);
  out.set(payload, 4);
  return [...out];
}

function jpegWithExif() {
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 0x47, 0x50, 0x53]),
    ...segment(0xdb, [1, 2, 3]),
    0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9,
  ]);
}

function jpegWithSafeAndLocationExif() {
  const tiff = new Uint8Array(74);
  const view = new DataView(tiff.buffer);
  view.setUint16(0, 0x4d4d);
  view.setUint16(2, 42);
  view.setUint32(4, 8);
  view.setUint16(8, 3);
  // Orientation = 6.
  view.setUint16(10, 0x0112);
  view.setUint16(12, 3);
  view.setUint32(14, 1);
  view.setUint16(18, 6);
  // DateTime points to TIFF offset 50.
  view.setUint16(22, 0x0132);
  view.setUint16(24, 2);
  view.setUint32(26, 20);
  view.setUint32(30, 50);
  // GPS IFD pointer points to a sentinel payload.
  view.setUint16(34, 0x8825);
  view.setUint16(36, 4);
  view.setUint32(38, 1);
  view.setUint32(42, 70);
  new TextEncoder().encodeInto("2026:09:19 12:34:56\0", tiff.subarray(50, 70));
  tiff.set([0x47, 0x50, 0x53, 0], 70);
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe1, [...new TextEncoder().encode("Exif\0\0"), ...tiff]),
    ...segment(0xdb, [1, 2, 3]),
    0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9,
  ]);
}

function pngChunk(type: string, payload: number[] = []) {
  const out = new Uint8Array(12 + payload.length);
  new DataView(out.buffer).setUint32(0, payload.length);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  out.set(payload, 8);
  return [...out];
}

function webpChunk(type: string, payload: number[]) {
  const out = new Uint8Array(8 + payload.length + (payload.length % 2));
  out.set([...type].map((c) => c.charCodeAt(0)), 0);
  new DataView(out.buffer).setUint32(4, payload.length, true);
  out.set(payload, 8);
  return [...out];
}

describe("sanitizeImage", () => {
  it("physically removes a JPEG EXIF segment", () => {
    const bytes = jpegWithExif();
    const result = stripGps(bytes);
    expect(result.understood).toBe(true);
    expect(result.strippedGps).toBe(true);
    expect(result.bytes.byteLength).toBeLessThan(bytes.byteLength);
    expect(new TextDecoder().decode(result.bytes)).not.toContain("GPS");
    expect(isJpeg(result.bytes)).toBe(true);
  });

  it("keeps orientation and capture time while removing the GPS payload", () => {
    const result = sanitizeImage(jpegWithSafeAndLocationExif());
    const text = new TextDecoder().decode(result.bytes);
    expect(result).toMatchObject({ understood: true, strippedGps: true, extension: "jpg" });
    expect(text).toContain("2026:09:19 12:34:56");
    expect(text).not.toContain("GPS");
    // Rebuilt big-endian orientation entry: tag, short, count 1, value 6.
    expect([...result.bytes]).toEqual(expect.arrayContaining([0x01, 0x12, 0, 3]));
  });

  it("removes metadata between progressive JPEG scans", () => {
    const bytes = new Uint8Array([
      0xff, 0xd8,
      ...segment(0xdb, [1, 2, 3]),
      0xff, 0xda, 0, 2,
      1, 0xff, 0, 2, 0xff, 0xd0, 3,
      ...segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 0x47, 0x50, 0x53]),
      0xff, 0xda, 0, 2,
      4, 5, 6,
      0xff, 0xd9,
    ]);
    const result = sanitizeImage(bytes);
    expect(result).toMatchObject({ understood: true, strippedGps: true, extension: "jpg" });
    expect(new TextDecoder().decode(result.bytes)).not.toContain("GPS");
    expect([...result.bytes].filter((byte, i, all) => byte === 0xda && all[i - 1] === 0xff)).toHaveLength(2);
  });

  it("removes PNG EXIF and text chunks while retaining image chunks", () => {
    const bytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ...pngChunk("IHDR", new Array(13).fill(0)),
      ...pngChunk("eXIf", [0x47, 0x50, 0x53]),
      ...pngChunk("IDAT", [1, 2]),
      ...pngChunk("IEND"),
    ]);
    const result = sanitizeImage(bytes);
    expect(result).toMatchObject({ understood: true, strippedGps: true, extension: "png" });
    expect(new TextDecoder().decode(result.bytes)).not.toContain("eXIf");
    expect(new TextDecoder().decode(result.bytes)).toContain("IDAT");
  });

  it("removes WebP EXIF chunks and fixes the RIFF length", () => {
    const chunks = [
      ...webpChunk("VP8X", [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ...webpChunk("EXIF", [0x47, 0x50, 0x53]),
      ...webpChunk("VP8 ", [1, 2]),
    ];
    const bytes = new Uint8Array(12 + chunks.length);
    bytes.set([0x52, 0x49, 0x46, 0x46]);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    bytes.set([0x57, 0x45, 0x42, 0x50], 8);
    bytes.set(chunks, 12);
    const result = sanitizeImage(bytes);
    expect(result).toMatchObject({ understood: true, strippedGps: true, extension: "webp" });
    expect(new TextDecoder().decode(result.bytes)).not.toContain("EXIF");
    expect(new DataView(result.bytes.buffer).getUint32(4, true)).toBe(result.bytes.length - 8);
    expect(new TextDecoder().decode(result.bytes).match(/VP8X/g)).toHaveLength(1);
  });

  it("fails closed for a truncated container", () => {
    expect(sanitizeImage(jpegWithExif().slice(0, 10)).understood).toBe(false);
  });

  it("rejects an unsupported format", () => {
    expect(sanitizeImage(new Uint8Array([1, 2, 3, 4])).understood).toBe(false);
  });
});
