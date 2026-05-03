// exif.ts — Zero-dependency EXIF reader covering the formats users
// actually drop into the editor: JPEG, HEIC/HEIF, AVIF, WebP, PNG,
// and TIFF. Each format hides the same TIFF/EXIF block in a
// different container, so we peel back the wrapper and hand a single
// `parseTiff()` the bare TIFF bytes:
//   • JPEG     — APP1 marker carrying "Exif\0\0" + TIFF
//   • HEIC/AVIF — ISOBMFF `meta` → `iinf` (item_type "Exif") → `iloc`
//   • WebP     — RIFF "EXIF" chunk (sometimes with "Exif\0\0" prefix)
//   • PNG      — "eXIf" chunk (TIFF is the chunk payload, no prefix)
//   • TIFF     — file *is* TIFF, parse from byte 0
// Format dispatch is by magic-byte sniffing rather than MIME so
// mislabelled or extension-less files still work.
//
// We deliberately decode only the tags we display, so the
// implementation stays small.

const TAG_NAMES: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x0131: "Software",
  0x0132: "DateTime",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISO",
  0x920a: "FocalLength",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
};

const GPS_TAG_NAMES: Record<number, string> = {
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
};

interface IfdValue {
  tag: number;
  type: number;
  count: number;
  value: number | number[] | string;
}

export interface ExifData {
  Make?: string;
  Model?: string;
  Software?: string;
  DateTime?: string;
  ExposureTime?: string;
  FNumber?: string;
  ISO?: number;
  FocalLength?: string;
  GPS?: string;
  Orientation?: number;
}

export async function readExif(file: File): Promise<ExifData | null> {
  // 256 KB sniff covers every chunked-format EXIF location we care
  // about: JPEG APP1 lands in the first ~64 KB, PNG "eXIf" sits
  // before IDAT, WebP "EXIF" early in the chunk list, and ISOBMFF
  // `meta` is right after `ftyp`. ISOBMFF only — we may still issue
  // a second targeted slice into mdat to read the actual EXIF
  // extent, but the box tree itself fits in the sniff window.
  const sniffSize = Math.min(file.size, 256 * 1024);
  const buf = new Uint8Array(await file.slice(0, sniffSize).arrayBuffer());
  const format = sniffFormat(buf);
  switch (format) {
    case "jpeg":
      return parseJpeg(buf);
    case "tiff":
      return parseTiff(buf);
    case "png":
      return parsePng(buf);
    case "webp":
      return parseWebp(buf);
    case "isobmff":
      return parseIsobmff(file, buf);
    default:
      return null;
  }
}

type ImageFormat = "jpeg" | "tiff" | "png" | "webp" | "isobmff";

function sniffFormat(buf: Uint8Array): ImageFormat | null {
  if (buf.length < 12) return null;
  // JPEG: SOI marker
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  // PNG: 8-byte signature
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "png";
  }
  // TIFF: II*\0 (little-endian) or MM\0* (big-endian)
  if (
    (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
    (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)
  ) {
    return "tiff";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "webp";
  }
  // ISOBMFF (HEIC, HEIF, AVIF, AVIS, mif1, msf1, …): bytes 4-7 = "ftyp".
  // We don't filter on the brand — every ISOBMFF derivative we care
  // about uses the same meta/iinf/iloc layout for EXIF.
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    return "isobmff";
  }
  return null;
}

function parseJpeg(buf: Uint8Array): ExifData | null {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 4) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === undefined) return null;
    if (marker === 0xda || marker === 0xd9) return null; // SOS / EOI
    const segLen = ((buf[i + 2] ?? 0) << 8) | (buf[i + 3] ?? 0);
    if (
      marker === 0xe1 &&
      buf[i + 4] === 0x45 /* E */ &&
      buf[i + 5] === 0x78 /* x */ &&
      buf[i + 6] === 0x69 /* i */ &&
      buf[i + 7] === 0x66 /* f */
    ) {
      // Found APP1 / Exif. Header: "Exif\0\0" (6 bytes), then TIFF data.
      const tiffStart = i + 10;
      const tiffEnd = i + 2 + segLen;
      return parseTiff(buf.subarray(tiffStart, tiffEnd));
    }
    i += 2 + segLen;
  }
  return null;
}

function parseTiff(buf: Uint8Array): ExifData | null {
  if (buf.length < 8) return null;
  const little =
    buf[0] === 0x49 && buf[1] === 0x49 ? true : buf[0] === 0x4d && buf[1] === 0x4d ? false : null;
  if (little === null) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  if (dv.getUint16(2, little) !== 0x002a) return null;
  const ifd0Offset = dv.getUint32(4, little);

  const out: ExifData = {};
  const exifSubIfdOffsets: number[] = [];
  const gpsIfdOffsets: number[] = [];

  for (const v of readIfd(dv, ifd0Offset, little)) {
    applyTag(out, v, dv, little);
    if (v.tag === 0x8769 && typeof v.value === "number") exifSubIfdOffsets.push(v.value);
    if (v.tag === 0x8825 && typeof v.value === "number") gpsIfdOffsets.push(v.value);
  }
  for (const off of exifSubIfdOffsets) {
    for (const v of readIfd(dv, off, little)) applyTag(out, v, dv, little);
  }
  for (const off of gpsIfdOffsets) {
    const gps: Record<string, number | number[] | string> = {};
    for (const v of readIfd(dv, off, little)) {
      const name = GPS_TAG_NAMES[v.tag];
      if (name) gps[name] = v.value;
    }
    out.GPS = formatGPS(gps);
  }
  return out;
}

function readIfd(dv: DataView, offset: number, little: boolean): IfdValue[] {
  if (offset <= 0 || offset + 2 > dv.byteLength) return [];
  const count = dv.getUint16(offset, little);
  const out: IfdValue[] = [];
  for (let i = 0; i < count; i++) {
    const entry = offset + 2 + i * 12;
    if (entry + 12 > dv.byteLength) break;
    const tag = dv.getUint16(entry, little);
    const type = dv.getUint16(entry + 2, little);
    const cnt = dv.getUint32(entry + 4, little);
    const value = readValue(dv, entry + 8, type, cnt, little);
    out.push({ tag, type, count: cnt, value });
  }
  return out;
}

function readValue(
  dv: DataView,
  valueOffset: number,
  type: number,
  count: number,
  little: boolean,
): number | number[] | string {
  const sizes: Record<number, number> = {
    1: 1, // BYTE
    2: 1, // ASCII
    3: 2, // SHORT
    4: 4, // LONG
    5: 8, // RATIONAL
    7: 1, // UNDEFINED
    9: 4, // SLONG
    10: 8, // SRATIONAL
  };
  const itemSize = sizes[type] ?? 1;
  const totalSize = itemSize * count;
  const offset = totalSize > 4 ? dv.getUint32(valueOffset, little) : valueOffset;

  if (type === 2) {
    // ASCII string
    const bytes: number[] = [];
    for (let i = 0; i < count; i++) {
      const c = dv.getUint8(offset + i);
      if (c === 0) break;
      bytes.push(c);
    }
    return String.fromCharCode(...bytes);
  }
  if (type === 5 || type === 10) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const num = dv.getUint32(offset + i * 8, little);
      const den = dv.getUint32(offset + i * 8 + 4, little);
      out.push(den === 0 ? 0 : num / den);
    }
    return count === 1 ? (out[0] ?? 0) : out;
  }
  if (type === 3) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(dv.getUint16(offset + i * 2, little));
    return count === 1 ? (out[0] ?? 0) : out;
  }
  if (type === 4 || type === 9) {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(dv.getUint32(offset + i * 4, little));
    return count === 1 ? (out[0] ?? 0) : out;
  }
  return 0;
}

function applyTag(out: ExifData, v: IfdValue, _dv: DataView, _little: boolean) {
  const name = TAG_NAMES[v.tag];
  if (!name) return;
  switch (name) {
    case "Make":
    case "Model":
    case "Software":
    case "DateTime":
    case "DateTimeOriginal":
    case "DateTimeDigitized":
      if (typeof v.value === "string")
        (out as Record<string, unknown>)[name === "DateTimeOriginal" ? "DateTime" : name] =
          v.value.trim();
      break;
    case "ExposureTime":
      if (typeof v.value === "number") out.ExposureTime = formatShutter(v.value);
      break;
    case "FNumber":
      if (typeof v.value === "number") out.FNumber = `f/${v.value.toFixed(1)}`;
      break;
    case "ISO":
      if (typeof v.value === "number") out.ISO = v.value;
      break;
    case "FocalLength":
      if (typeof v.value === "number") out.FocalLength = `${v.value.toFixed(1)} mm`;
      break;
    case "Orientation":
      if (typeof v.value === "number") out.Orientation = v.value;
      break;
  }
}

function formatShutter(t: number): string {
  if (t >= 1) return `${t.toFixed(1)}s`;
  return `1/${Math.round(1 / t)}s`;
}

function formatGPS(g: Record<string, number | number[] | string>): string {
  const lat = toDeg(g.GPSLatitude as number[]);
  const lon = toDeg(g.GPSLongitude as number[]);
  const latRef = (g.GPSLatitudeRef as string) || "";
  const lonRef = (g.GPSLongitudeRef as string) || "";
  if (lat == null || lon == null) return "";
  return `${lat.toFixed(4)}° ${latRef}, ${lon.toFixed(4)}° ${lonRef}`;
}

function toDeg(arr: number[] | undefined): number | null {
  if (!arr || arr.length < 3) return null;
  const [d, m, s] = arr;
  return (d ?? 0) + (m ?? 0) / 60 + (s ?? 0) / 3600;
}

/** Flatten parsed EXIF into a [label, value] table for display. */
export function exifToFields(exif: ExifData | null): Array<[string, string]> {
  if (!exif) return [];
  const out: Array<[string, string]> = [];
  if (exif.Make || exif.Model)
    out.push(["Camera", `${exif.Make ?? ""} ${exif.Model ?? ""}`.trim()]);
  if (exif.FocalLength || exif.FNumber) {
    const parts = [exif.FocalLength, exif.FNumber].filter(Boolean) as string[];
    out.push(["Lens", parts.join(" ")]);
  }
  if (exif.ISO || exif.ExposureTime) {
    const parts = [exif.ISO ? `ISO ${exif.ISO}` : null, exif.ExposureTime ?? null].filter(
      Boolean,
    ) as string[];
    out.push(["Exposure", parts.join(" · ")]);
  }
  if (exif.DateTime) out.push(["Date", exif.DateTime]);
  if (exif.GPS) out.push(["GPS", exif.GPS]);
  if (exif.Software) out.push(["Software", exif.Software]);
  return out;
}

// ── PNG ────────────────────────────────────────────────────────────
// PNG stores EXIF in an `eXIf` chunk added to the spec in 2017. The
// chunk payload IS the TIFF block (no leading offset / "Exif\0\0"
// header), so once we find it we can hand it straight to parseTiff.
// Older PNGs put EXIF in tEXt/iTXt key="Raw profile type exif" but
// that's vanishingly rare in practice and we don't bother.

function parsePng(buf: Uint8Array): ExifData | null {
  // 8-byte signature already verified by sniffFormat — start chunks at 8.
  let i = 8;
  while (i + 8 <= buf.length) {
    const length =
      ((buf[i] ?? 0) << 24) |
      ((buf[i + 1] ?? 0) << 16) |
      ((buf[i + 2] ?? 0) << 8) |
      (buf[i + 3] ?? 0);
    const type = String.fromCharCode(
      buf[i + 4] ?? 0,
      buf[i + 5] ?? 0,
      buf[i + 6] ?? 0,
      buf[i + 7] ?? 0,
    );
    const dataStart = i + 8;
    if (dataStart + length + 4 > buf.length) return null;
    if (type === "eXIf") {
      return parseTiff(buf.subarray(dataStart, dataStart + length));
    }
    // IEND terminates the file; bail rather than reading garbage.
    if (type === "IEND") return null;
    i = dataStart + length + 4; // skip CRC
  }
  return null;
}

// ── WebP ───────────────────────────────────────────────────────────
// WebP is RIFF: 12-byte header, then FourCC + 4-byte little-endian
// size + payload chunks (each padded to even byte). The "EXIF" chunk
// payload is usually the bare TIFF block, but a few encoders prefix
// it with the JPEG-style "Exif\0\0" header — so we tolerate either.

function parseWebp(buf: Uint8Array): ExifData | null {
  let i = 12;
  while (i + 8 <= buf.length) {
    const type = String.fromCharCode(
      buf[i] ?? 0,
      buf[i + 1] ?? 0,
      buf[i + 2] ?? 0,
      buf[i + 3] ?? 0,
    );
    const size =
      (buf[i + 4] ?? 0) |
      ((buf[i + 5] ?? 0) << 8) |
      ((buf[i + 6] ?? 0) << 16) |
      ((buf[i + 7] ?? 0) << 24);
    const dataStart = i + 8;
    if (dataStart + size > buf.length) return null;
    if (type === "EXIF") {
      let payload = buf.subarray(dataStart, dataStart + size);
      if (
        payload.length >= 6 &&
        payload[0] === 0x45 /* E */ &&
        payload[1] === 0x78 /* x */ &&
        payload[2] === 0x69 /* i */ &&
        payload[3] === 0x66 /* f */
      ) {
        payload = payload.subarray(6);
      }
      return parseTiff(payload);
    }
    // RIFF chunks are padded to even size — skip the padding byte.
    i = dataStart + size + (size & 1);
  }
  return null;
}

// ── ISOBMFF (HEIC, HEIF, AVIF, AVIS, mif1, msf1, …) ────────────────
// All of these wrap EXIF the same way: a typed item inside the `meta`
// box. To find the bytes we walk:
//   meta (FullBox) → iinf → infe* → match item_type "Exif" → item_ID
//   meta (FullBox) → iloc → match item_ID → (offset, length) into file
// The extent itself begins with a 4-byte big-endian offset to the
// TIFF header (per ISO/IEC 23008-12 ExifDataBlock); some encoders set
// it to 0, others to 6 (skipping a leading "Exif\0\0"), so we trust
// the field but fall back to scanning for the `II*\0` / `MM\0*`
// magic when the offset doesn't land on it.

interface Box {
  type: string;
  size: number;
  payload: Uint8Array;
}

async function parseIsobmff(file: File, header: Uint8Array): Promise<ExifData | null> {
  const meta = findBox(header, "meta", 0, header.length);
  if (!meta) return null;
  // `meta` is a FullBox: 1-byte version + 3-byte flags before children.
  const metaInner = meta.payload.subarray(4);
  const iinf = findBox(metaInner, "iinf", 0, metaInner.length);
  const iloc = findBox(metaInner, "iloc", 0, metaInner.length);
  if (!iinf || !iloc) return null;
  const exifItemId = findExifItemId(iinf.payload);
  if (exifItemId === null) return null;
  const extent = findItemExtent(iloc.payload, exifItemId);
  if (!extent || extent.length < 4) return null;

  // Read just the EXIF extent — usually a few KB even for very large
  // photos — so we never load mdat just to read metadata.
  const dataSlice = file.slice(extent.offset, extent.offset + extent.length);
  const data = new Uint8Array(await dataSlice.arrayBuffer());
  if (data.length < 4) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tiffHeaderOffset = dv.getUint32(0, false);
  let tiffStart = 4 + tiffHeaderOffset;
  if (tiffStart >= data.length || !isTiffMarker(data, tiffStart)) {
    tiffStart = scanForTiffMarker(data, 4, 32);
    if (tiffStart < 0) return null;
  }
  return parseTiff(data.subarray(tiffStart));
}

function readBoxAt(buf: Uint8Array, offset: number): Box | null {
  if (offset + 8 > buf.length) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset + offset, Math.min(buf.length - offset, 16));
  let size = dv.getUint32(0, false);
  const type = String.fromCharCode(
    buf[offset + 4] ?? 0,
    buf[offset + 5] ?? 0,
    buf[offset + 6] ?? 0,
    buf[offset + 7] ?? 0,
  );
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > buf.length) return null;
    const high = dv.getUint32(8, false);
    const low = dv.getUint32(12, false);
    if (high !== 0) return null;
    size = low;
    headerSize = 16;
  } else if (size === 0) {
    size = buf.length - offset;
  }
  if (size < headerSize || offset + size > buf.length) return null;
  return {
    type,
    size,
    payload: buf.subarray(offset + headerSize, offset + size),
  };
}

function findBox(buf: Uint8Array, type: string, start: number, end: number): Box | null {
  let i = start;
  while (i < end) {
    const box = readBoxAt(buf, i);
    if (!box) return null;
    if (box.type === type) return box;
    i += box.size;
  }
  return null;
}

function findExifItemId(iinfPayload: Uint8Array): number | null {
  if (iinfPayload.length < 6) return null;
  const dv = new DataView(iinfPayload.buffer, iinfPayload.byteOffset, iinfPayload.byteLength);
  const version = iinfPayload[0] ?? 0;
  let cursor = 4;
  let entryCount: number;
  if (version === 0) {
    entryCount = dv.getUint16(cursor, false);
    cursor += 2;
  } else {
    entryCount = dv.getUint32(cursor, false);
    cursor += 4;
  }
  for (let i = 0; i < entryCount && cursor < iinfPayload.length; i++) {
    const box = readBoxAt(iinfPayload, cursor);
    if (!box) break;
    if (box.type === "infe") {
      const id = readInfeForExif(box.payload);
      if (id !== null) return id;
    }
    cursor += box.size;
  }
  return null;
}

function readInfeForExif(payload: Uint8Array): number | null {
  if (payload.length < 4) return null;
  const version = payload[0] ?? 0;
  // Only v2/v3 carry an item_type field; older variants can't tag
  // an item as "Exif", so they cannot be the entry we want.
  if (version < 2) return null;
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  let cursor = 4;
  let itemId: number;
  if (version === 2) {
    if (cursor + 2 > payload.length) return null;
    itemId = dv.getUint16(cursor, false);
    cursor += 2;
  } else {
    if (cursor + 4 > payload.length) return null;
    itemId = dv.getUint32(cursor, false);
    cursor += 4;
  }
  cursor += 2; // item_protection_index
  if (cursor + 4 > payload.length) return null;
  const itemType = String.fromCharCode(
    payload[cursor] ?? 0,
    payload[cursor + 1] ?? 0,
    payload[cursor + 2] ?? 0,
    payload[cursor + 3] ?? 0,
  );
  if (itemType !== "Exif") return null;
  return itemId;
}

function findItemExtent(
  ilocPayload: Uint8Array,
  targetItemId: number,
): { offset: number; length: number } | null {
  if (ilocPayload.length < 8) return null;
  const dv = new DataView(ilocPayload.buffer, ilocPayload.byteOffset, ilocPayload.byteLength);
  const version = ilocPayload[0] ?? 0;
  let cursor = 4;
  const sizesByte = ilocPayload[cursor] ?? 0;
  cursor += 1;
  const offsetSize = (sizesByte >> 4) & 0x0f;
  const lengthSize = sizesByte & 0x0f;
  const baseSizesByte = ilocPayload[cursor] ?? 0;
  cursor += 1;
  const baseOffsetSize = (baseSizesByte >> 4) & 0x0f;
  const indexSize = version === 1 || version === 2 ? baseSizesByte & 0x0f : 0;

  let itemCount: number;
  if (version < 2) {
    if (cursor + 2 > ilocPayload.length) return null;
    itemCount = dv.getUint16(cursor, false);
    cursor += 2;
  } else {
    if (cursor + 4 > ilocPayload.length) return null;
    itemCount = dv.getUint32(cursor, false);
    cursor += 4;
  }

  for (let i = 0; i < itemCount; i++) {
    let itemId: number;
    if (version < 2) {
      if (cursor + 2 > ilocPayload.length) return null;
      itemId = dv.getUint16(cursor, false);
      cursor += 2;
    } else {
      if (cursor + 4 > ilocPayload.length) return null;
      itemId = dv.getUint32(cursor, false);
      cursor += 4;
    }
    if (version === 1 || version === 2) {
      if (cursor + 2 > ilocPayload.length) return null;
      cursor += 2; // 12 reserved bits + 4 construction_method
    }
    if (cursor + 2 > ilocPayload.length) return null;
    cursor += 2; // data_reference_index
    if (cursor + baseOffsetSize > ilocPayload.length) return null;
    const baseOffset = readUintBE(dv, cursor, baseOffsetSize);
    cursor += baseOffsetSize;
    if (cursor + 2 > ilocPayload.length) return null;
    const extentCount = dv.getUint16(cursor, false);
    cursor += 2;
    for (let j = 0; j < extentCount; j++) {
      if ((version === 1 || version === 2) && indexSize > 0) {
        if (cursor + indexSize > ilocPayload.length) return null;
        cursor += indexSize;
      }
      if (cursor + offsetSize + lengthSize > ilocPayload.length) return null;
      const extentOffset = readUintBE(dv, cursor, offsetSize);
      cursor += offsetSize;
      const extentLength = readUintBE(dv, cursor, lengthSize);
      cursor += lengthSize;
      if (itemId === targetItemId) {
        return { offset: baseOffset + extentOffset, length: extentLength };
      }
    }
  }
  return null;
}

function readUintBE(dv: DataView, offset: number, size: number): number {
  switch (size) {
    case 0:
      return 0;
    case 1:
      return dv.getUint8(offset);
    case 2:
      return dv.getUint16(offset, false);
    case 4:
      return dv.getUint32(offset, false);
    case 8: {
      // JS numbers stay exact up to 2^53; no real HEIC offset gets close.
      const high = dv.getUint32(offset, false);
      const low = dv.getUint32(offset + 4, false);
      return high * 0x100000000 + low;
    }
    default:
      return 0;
  }
}

function isTiffMarker(buf: Uint8Array, offset: number): boolean {
  if (offset + 4 > buf.length) return false;
  const a = buf[offset];
  const b = buf[offset + 1];
  const c = buf[offset + 2];
  const d = buf[offset + 3];
  return (
    (a === 0x49 && b === 0x49 && c === 0x2a && d === 0x00) ||
    (a === 0x4d && b === 0x4d && c === 0x00 && d === 0x2a)
  );
}

function scanForTiffMarker(buf: Uint8Array, start: number, span: number): number {
  const limit = Math.min(buf.length - 4, start + span);
  for (let i = start; i < limit; i++) {
    if (isTiffMarker(buf, i)) return i;
  }
  return -1;
}
