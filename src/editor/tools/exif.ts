// exif.ts — Tiny zero-dependency EXIF reader for JPEGs. Walks the
// APP1 marker, parses the TIFF header + IFD0 + ExifSubIFD + GPS, and
// returns a friendly key → value map for the metadata panel.
//
// We deliberately decode only the tags we display, so the implementation
// stays small. PNG/HEIC/AVIF aren't covered — they typically have no
// JPEG-style EXIF anyway.

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
  if (!file.type.includes("jpeg") && !file.name.toLowerCase().endsWith(".jpg")) {
    return null;
  }
  // We only need the first 256 KB to find the APP1 marker reliably.
  const slice = file.slice(0, Math.min(file.size, 256 * 1024));
  const buf = new Uint8Array(await slice.arrayBuffer());
  return parseJpeg(buf);
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
