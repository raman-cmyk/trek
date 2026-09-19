/** Remove location-bearing metadata from accepted images before storage. */
export type SafeImageType = "image/jpeg" | "image/png" | "image/webp";

export interface StripResult {
  bytes: Uint8Array<ArrayBuffer>;
  strippedGps: boolean;
  understood: boolean;
  contentType?: SafeImageType;
  extension?: "jpg" | "png" | "webp";
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** Rebuild EXIF from an explicit allowlist: orientation and capture timestamp. */
function safeExifSegment(segment: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> | null {
  if (segment.byteLength < 18 || new TextDecoder().decode(segment.slice(4, 10)) !== "Exif\0\0") {
    return null;
  }
  const tiff = 10;
  const view = new DataView(segment.buffer, segment.byteOffset, segment.byteLength);
  const byteOrder = view.getUint16(tiff);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
  const little = byteOrder === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return null;
  const ifd = tiff + view.getUint32(tiff + 4, little);
  if (ifd + 2 > segment.byteLength) return null;
  const count = view.getUint16(ifd, little);
  let orientation: number | null = null;
  let dateTime: string | null = null;
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > segment.byteLength) return null;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const values = view.getUint32(entry + 4, little);
    if (tag === 0x0112 && type === 3 && values === 1) {
      const value = view.getUint16(entry + 8, little);
      if (value >= 1 && value <= 8) orientation = value;
    }
    if (tag === 0x0132 && type === 2 && values >= 19 && values <= 20) {
      const start = tiff + view.getUint32(entry + 8, little);
      if (start + values > segment.byteLength) return null;
      const candidate = new TextDecoder().decode(segment.slice(start, start + values)).replace(/\0+$/, "");
      if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(candidate)) dateTime = candidate;
    }
  }
  if (orientation == null && dateTime == null) return null;

  const entries = Number(orientation != null) + Number(dateTime != null);
  const dateBytes = dateTime ? new TextEncoder().encode(`${dateTime}\0`) : new Uint8Array();
  const tiffLength = 8 + 2 + entries * 12 + 4 + dateBytes.byteLength;
  const payloadLength = 6 + tiffLength;
  const out = new Uint8Array(4 + payloadLength);
  const target = new DataView(out.buffer);
  out.set([0xff, 0xe1]);
  target.setUint16(2, payloadLength + 2);
  out.set(new TextEncoder().encode("Exif\0\0"), 4);
  const base = 10;
  target.setUint16(base, 0x4d4d);
  target.setUint16(base + 2, 42);
  target.setUint32(base + 4, 8);
  let entry = base + 8;
  target.setUint16(entry, entries);
  entry += 2;
  if (orientation != null) {
    target.setUint16(entry, 0x0112);
    target.setUint16(entry + 2, 3);
    target.setUint32(entry + 4, 1);
    target.setUint16(entry + 8, orientation);
    entry += 12;
  }
  if (dateTime != null) {
    target.setUint16(entry, 0x0132);
    target.setUint16(entry + 2, 2);
    target.setUint32(entry + 4, dateBytes.byteLength);
    target.setUint32(entry + 8, 8 + 2 + entries * 12 + 4);
    entry += 12;
  }
  target.setUint32(entry, 0);
  if (dateTime != null) out.set(dateBytes, entry + 4);
  return out;
}

function cleanJpeg(input: Uint8Array<ArrayBuffer>): StripResult {
  if (!isJpeg(input)) return { bytes: input, strippedGps: false, understood: false };
  const parts: Uint8Array[] = [input.slice(0, 2)];
  let offset = 2;
  let removed = false;

  while (offset < input.byteLength) {
    if (input[offset] !== 0xff) return { bytes: input, strippedGps: false, understood: false };
    const markerStart = offset;
    while (offset < input.byteLength && input[offset] === 0xff) offset++;
    if (offset >= input.byteLength) return { bytes: input, strippedGps: false, understood: false };
    const marker = input[offset++];

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.slice(markerStart, offset));
      if (marker === 0xd9) {
        if (offset !== input.byteLength) return { bytes: input, strippedGps: false, understood: false };
        return {
          bytes: removed ? concat(parts) : input,
          strippedGps: removed,
          understood: true,
          contentType: "image/jpeg",
          extension: "jpg",
        };
      }
      continue;
    }

    if (offset + 2 > input.byteLength) return { bytes: input, strippedGps: false, understood: false };
    const length = (input[offset] << 8) | input[offset + 1];
    if (length < 2) return { bytes: input, strippedGps: false, understood: false };
    const segmentEnd = offset + length;
    if (segmentEnd > input.byteLength) return { bytes: input, strippedGps: false, understood: false };

    if (marker === 0xda) {
      // A progressive JPEG may contain several scans, with ordinary marker
      // segments between them. Copy only entropy-coded bytes here and return
      // to the marker parser so post-scan EXIF/IPTC cannot evade sanitizing.
      parts.push(input.slice(markerStart, segmentEnd));
      const scanStart = segmentEnd;
      let scanOffset = scanStart;
      let foundNextMarker = false;
      while (scanOffset < input.byteLength) {
        if (input[scanOffset] !== 0xff) {
          scanOffset++;
          continue;
        }
        const nextMarkerStart = scanOffset;
        while (scanOffset < input.byteLength && input[scanOffset] === 0xff) scanOffset++;
        if (scanOffset >= input.byteLength) break;
        const nextMarker = input[scanOffset];
        if (nextMarker === 0x00 || (nextMarker >= 0xd0 && nextMarker <= 0xd7)) {
          scanOffset++;
          continue;
        }
        parts.push(input.slice(scanStart, nextMarkerStart));
        offset = nextMarkerStart;
        foundNextMarker = true;
        break;
      }
      if (!foundNextMarker) return { bytes: input, strippedGps: false, understood: false };
      continue;
    }

    // APP1 = EXIF/XMP, APP13 = IPTC, COM = arbitrary metadata. Dropping the
    // whole segment removes the sensitive payload instead of hiding a pointer.
    if (marker === 0xe1) {
      const safe = safeExifSegment(input.slice(markerStart, segmentEnd));
      if (safe) parts.push(safe);
      removed = true;
    } else if (marker === 0xed || marker === 0xfe) removed = true;
    else parts.push(input.slice(markerStart, segmentEnd));
    offset = segmentEnd;
  }

  return { bytes: input, strippedGps: false, understood: false };
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_METADATA = new Set(["eXIf", "tEXt", "zTXt", "iTXt"]);

function cleanPng(input: Uint8Array<ArrayBuffer>): StripResult {
  if (!isPng(input)) return { bytes: input, strippedGps: false, understood: false };
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const parts: Uint8Array[] = [input.slice(0, 8)];
  let offset = 8;
  let removed = false;
  let sawIhdr = false;
  let sawIend = false;

  while (offset < input.byteLength) {
    if (offset + 12 > input.byteLength) return { bytes: input, strippedGps: false, understood: false };
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > input.byteLength) return { bytes: input, strippedGps: false, understood: false };
    const type = String.fromCharCode(...input.slice(offset + 4, offset + 8));
    if (!sawIhdr) {
      if (type !== "IHDR") return { bytes: input, strippedGps: false, understood: false };
      sawIhdr = true;
    }
    if (PNG_METADATA.has(type)) removed = true;
    else parts.push(input.slice(offset, end));
    offset = end;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }

  if (!sawIhdr || !sawIend || offset !== input.byteLength) {
    return { bytes: input, strippedGps: false, understood: false };
  }
  return {
    bytes: removed ? concat(parts) : input,
    strippedGps: removed,
    understood: true,
    contentType: "image/png",
    extension: "png",
  };
}

function cleanWebp(input: Uint8Array<ArrayBuffer>): StripResult {
  if (!isWebp(input)) return { bytes: input, strippedGps: false, understood: false };
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  if (view.getUint32(4, true) + 8 !== input.byteLength) {
    return { bytes: input, strippedGps: false, understood: false };
  }
  const parts: Uint8Array[] = [input.slice(0, 12)];
  let offset = 12;
  let removed = false;
  while (offset < input.byteLength) {
    if (offset + 8 > input.byteLength) return { bytes: input, strippedGps: false, understood: false };
    const type = String.fromCharCode(...input.slice(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const end = offset + 8 + length + (length % 2);
    if (end > input.byteLength) return { bytes: input, strippedGps: false, understood: false };
    if (type === "EXIF" || type === "XMP ") {
      removed = true;
    } else {
      const chunk = input.slice(offset, end);
      if (type === "VP8X" && length >= 1) {
        const copy = chunk.slice();
        copy[8] &= ~0x0c;
        parts.push(copy);
      } else parts.push(chunk);
    }
    offset = end;
  }

  const bytes = removed ? concat(parts) : input;
  if (removed) new DataView(bytes.buffer).setUint32(4, bytes.byteLength - 8, true);
  return {
    bytes,
    strippedGps: removed,
    understood: true,
    contentType: "image/webp",
    extension: "webp",
  };
}

export function sanitizeImage(input: Uint8Array<ArrayBuffer>): StripResult {
  if (isJpeg(input)) return cleanJpeg(input);
  if (isPng(input)) return cleanPng(input);
  if (isWebp(input)) return cleanWebp(input);
  return { bytes: input, strippedGps: false, understood: false };
}

export function stripGps(input: Uint8Array<ArrayBuffer>): StripResult {
  return cleanJpeg(input);
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && PNG_SIGNATURE.every((value, i) => bytes[i] === value);
}

export function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}
