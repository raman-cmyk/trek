/**
 * Strip GPS out of a JPEG before it is stored.
 *
 * A guide uploads photos straight off a phone. Those carry the exact
 * coordinates of a teahouse, a campsite, and sometimes a client's home if the
 * roll got mixed up — published on a page whose whole purpose is to be public.
 * The dates we WANT (they are how you check a journal against the trek it
 * claims to be), so this removes the GPS IFD specifically rather than
 * flattening the whole EXIF block.
 *
 * Runs on Cloudflare Workers, so it is plain byte surgery: no sharp, no canvas.
 * Anything it does not understand it leaves alone and reports, and the caller
 * refuses the upload rather than storing a file it could not inspect.
 */

const SOI = 0xffd8;
const APP1 = 0xffe1;
const GPS_IFD_TAG = 0x8825;

export interface StripResult {
  /** Same buffer, edited in place — the GPS pointer is zeroed, nothing moves. */
  bytes: Uint8Array<ArrayBuffer>;
  /** True when a GPS pointer was found and removed. */
  strippedGps: boolean;
  /** True when the file is a JPEG we could parse end to end. */
  understood: boolean;
}

export function stripGps(input: Uint8Array<ArrayBuffer>): StripResult {
  const n = input.byteLength;
  const v = new DataView(input.buffer, input.byteOffset, n);
  // Every read is bounds-checked and returns null past the end. A phone upload
  // truncated by a dropped 3G connection is a normal Tuesday here, and a
  // RangeError thrown out of this function would 500 the guide's upload.
  const u8 = (p: number) => (p + 1 <= n ? v.getUint8(p) : null);
  const u16 = (p: number, le = false) => (p + 2 <= n ? v.getUint16(p, le) : null);
  const u32 = (p: number, le = false) => (p + 4 <= n ? v.getUint32(p, le) : null);

  if (n < 4 || u16(0) !== SOI) {
    return { bytes: input, strippedGps: false, understood: false };
  }

  let offset = 2;
  let strippedGps = false;

  while (offset + 4 <= n) {
    if (u8(offset) !== 0xff) break;
    const marker = u16(offset);
    // Start of scan — image data from here; nothing left to inspect.
    if (marker === 0xffda) return { bytes: input, strippedGps, understood: true };
    const segLen = u16(offset + 2);
    if (segLen == null || segLen < 2) break;

    if (marker === APP1) {
      const segStart = offset + 4;
      // "Exif\0\0"
      if (u32(segStart) === 0x45786966 && u16(segStart + 4) === 0x0000) {
        const tiff = segStart + 6;
        const le = u16(tiff) === 0x4949;
        if (u16(tiff + 2, le) === 42) {
          const ifdOff = u32(tiff + 4, le);
          const ifd0 = ifdOff == null ? null : tiff + ifdOff;
          const count = ifd0 == null ? null : u16(ifd0, le);
          if (ifd0 != null && count != null) {
            for (let i = 0; i < count; i++) {
              const entry = ifd0 + 2 + i * 12;
              if (entry + 12 > n) break;
              // Only act on a pointer that actually points somewhere, so a
              // second pass over an already-cleaned file reports honestly
              // that there was nothing to remove.
              if (u16(entry, le) === GPS_IFD_TAG && u32(entry + 8, le)) {
                // Blank the pointer's value: a reader following it lands on
                // offset 0, which every implementation treats as "no GPS".
                v.setUint32(entry + 8, 0, le);
                strippedGps = true;
              }
            }
          }
        }
      }
    }

    offset += 2 + segLen;
  }

  return { bytes: input, strippedGps, understood: true };
}

/** Cheap magic-byte check; we only accept what stripGps can actually read. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
}
