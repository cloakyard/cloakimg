// exifFilter.ts — Selective EXIF preservation for JPEG export.
//
// canvas.toBlob() unconditionally strips metadata. To honour the
// MetadataPanel's per-group toggles we instead:
//
//   1. Read the source JPEG's APP1 (Exif) segment
//   2. "Neutralise" individual tag entries the user wants stripped by
//      rewriting the entry's tag ID to a reserved value and zeroing
//      its value bytes (both inline 4-byte slot and any overflow data)
//   3. Optionally drop the GPS sub-IFD pointer entirely
//   4. Splice the modified APP1 segment into the freshly-encoded JPEG
//
// This avoids a full IFD re-serializer (which would require offset
// rewriting) while still erasing the bytes any standard EXIF tool would
// surface — Photos, Lightroom, exiftool all skip 0xFFFE entries with
// zero-length values.

const NEUTRAL_TAG = 0xfffe; // SubsecTime / Pad — treated as private by tools
const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8, // SRATIONAL
};

const CAMERA_TAGS = new Set<number>([
  0x010f, // Make
  0x0110, // Model
  0x0131, // Software
  0x013b, // Artist
  0x8298, // Copyright
  0x829a, // ExposureTime
  0x829d, // FNumber
  0x8822, // ExposureProgram
  0x8827, // ISO
  0x8830, // SensitivityType
  0x9201, // ShutterSpeedValue
  0x9202, // ApertureValue
  0x9204, // ExposureBiasValue
  0x9207, // MeteringMode
  0x9208, // LightSource
  0x9209, // Flash
  0x920a, // FocalLength
  0xa402, // ExposureMode
  0xa403, // WhiteBalance
  0xa405, // FocalLengthIn35mmFormat
  0xa432, // LensInfo
  0xa433, // LensMake
  0xa434, // LensModel
  0xa435, // LensSerialNumber
]);

const TIMESTAMP_TAGS = new Set<number>([
  0x0132, // DateTime
  0x9003, // DateTimeOriginal
  0x9004, // DateTimeDigitized
  0x9290, // SubsecTime
  0x9291, // SubsecTimeOriginal
  0x9292, // SubsecTimeDigitized
]);

const GPS_IFD_POINTER_TAG = 0x8825;

export interface KeepRules {
  stripGPS: boolean;
  stripCamera: boolean;
  stripTimestamp: boolean;
  keepICC: boolean;
}

/**
 * Read source JPEG bytes, build a filtered APP1 segment, and splice it
 * into the freshly-encoded `jpegBytes` returned by canvas.toBlob.
 * Returns the original encoded bytes if there's nothing to preserve.
 */
export function filterAndInjectExif(
  sourceBytes: Uint8Array | null,
  jpegBytes: Uint8Array,
  rules: KeepRules,
): Uint8Array {
  // If everything is being stripped, the canvas-encoded JPEG already
  // matches the user's intent.
  if (rules.stripGPS && rules.stripCamera && rules.stripTimestamp) {
    return jpegBytes;
  }
  if (!sourceBytes || !looksLikeJpeg(sourceBytes) || !looksLikeJpeg(jpegBytes)) {
    return jpegBytes;
  }

  const app1 = extractApp1(sourceBytes);
  if (!app1) return jpegBytes;

  const filtered = filterApp1(app1, rules);
  return spliceApp1(jpegBytes, filtered);
}

function looksLikeJpeg(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8;
}

/** Returns a fresh Uint8Array containing the full APP1 segment
 *  (FF E1 LL LL ... payload), or null if not present. */
function extractApp1(buf: Uint8Array): Uint8Array | null {
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === undefined) return null;
    if (marker === 0xda || marker === 0xd9) return null;
    const segLen = ((buf[i + 2] ?? 0) << 8) | (buf[i + 3] ?? 0);
    if (
      marker === 0xe1 &&
      buf[i + 4] === 0x45 &&
      buf[i + 5] === 0x78 &&
      buf[i + 6] === 0x69 &&
      buf[i + 7] === 0x66
    ) {
      const totalLen = 2 + segLen;
      return buf.slice(i, i + totalLen);
    }
    i += 2 + segLen;
  }
  return null;
}

/** Mutates a *copy* of the APP1 segment, neutralising stripped tags. */
function filterApp1(app1: Uint8Array, rules: KeepRules): Uint8Array {
  const out = app1.slice();
  // APP1 layout: [FF E1] [LEN 2] [Exif\0\0 6] [TIFF data ...]
  const tiffOffset = 10;
  const tiff = new Uint8Array(out.buffer, out.byteOffset + tiffOffset, out.length - tiffOffset);
  if (tiff.length < 8) return out;

  const little =
    tiff[0] === 0x49 && tiff[1] === 0x49
      ? true
      : tiff[0] === 0x4d && tiff[1] === 0x4d
        ? false
        : null;
  if (little === null) return out;

  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  if (dv.getUint16(2, little) !== 0x002a) return out;
  const ifd0Offset = dv.getUint32(4, little);

  // Track sub-IFD pointers we discover while walking IFD0.
  const subIfdOffsets: number[] = [];

  walkIfd(tiff, dv, ifd0Offset, little, (entry) => {
    const tag = dv.getUint16(entry, little);
    if (tag === 0x8769 /* ExifSubIFD */) {
      const off = dv.getUint32(entry + 8, little);
      if (off > 0) subIfdOffsets.push(off);
    }
    if (tag === GPS_IFD_POINTER_TAG && rules.stripGPS) {
      const off = dv.getUint32(entry + 8, little);
      if (off > 0) zeroIfd(tiff, dv, off, little);
      neutraliseEntry(tiff, dv, entry, little);
      return;
    }
    if (rules.stripCamera && CAMERA_TAGS.has(tag)) {
      neutraliseEntry(tiff, dv, entry, little);
      return;
    }
    if (rules.stripTimestamp && TIMESTAMP_TAGS.has(tag)) {
      neutraliseEntry(tiff, dv, entry, little);
      return;
    }
  });

  for (const off of subIfdOffsets) {
    walkIfd(tiff, dv, off, little, (entry) => {
      const tag = dv.getUint16(entry, little);
      if (rules.stripCamera && CAMERA_TAGS.has(tag)) {
        neutraliseEntry(tiff, dv, entry, little);
      } else if (rules.stripTimestamp && TIMESTAMP_TAGS.has(tag)) {
        neutraliseEntry(tiff, dv, entry, little);
      }
    });
  }

  return out;
}

function walkIfd(
  tiff: Uint8Array,
  dv: DataView,
  offset: number,
  little: boolean,
  visit: (entry: number) => void,
) {
  if (offset <= 0 || offset + 2 > tiff.length) return;
  const count = dv.getUint16(offset, little);
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    visit(entry);
  }
}

function neutraliseEntry(tiff: Uint8Array, dv: DataView, entry: number, little: boolean) {
  const type = dv.getUint16(entry + 2, little);
  const count = dv.getUint32(entry + 4, little);
  const itemSize = TYPE_SIZES[type] ?? 1;
  const total = itemSize * count;
  if (total > 4) {
    const off = dv.getUint32(entry + 8, little);
    for (let j = 0; j < total && off + j < tiff.length; j++) tiff[off + j] = 0;
  }
  dv.setUint16(entry, NEUTRAL_TAG, little);
  dv.setUint32(entry + 8, 0, little);
}

function zeroIfd(tiff: Uint8Array, dv: DataView, offset: number, little: boolean) {
  if (offset <= 0 || offset + 2 > tiff.length) return;
  const count = dv.getUint16(offset, little);
  // Zero each entry's value-overflow bytes too, then the entries themselves.
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    neutraliseEntry(tiff, dv, entry, little);
  }
  // Set count to zero so readers see an empty IFD.
  dv.setUint16(offset, 0, little);
}

/** Insert an APP1 segment into a JPEG right after SOI (and any APP0). */
function spliceApp1(jpegBytes: Uint8Array, app1: Uint8Array): Uint8Array {
  // Find insertion point: after SOI, after any APP0/JFIF marker, before
  // anything else (DQT, SOF, etc.).
  let insertAt = 2;
  let i = 2;
  while (i < jpegBytes.length - 4) {
    if (jpegBytes[i] !== 0xff) break;
    const marker = jpegBytes[i + 1];
    if (marker === undefined) break;
    if (marker === 0xe0) {
      const segLen = ((jpegBytes[i + 2] ?? 0) << 8) | (jpegBytes[i + 3] ?? 0);
      i += 2 + segLen;
      insertAt = i;
      continue;
    }
    break;
  }
  const out = new Uint8Array(jpegBytes.length + app1.length);
  out.set(jpegBytes.subarray(0, insertAt), 0);
  out.set(app1, insertAt);
  out.set(jpegBytes.subarray(insertAt), insertAt + app1.length);
  return out;
}
