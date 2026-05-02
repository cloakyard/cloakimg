// zip.ts — Zero-dep STORE-only zip writer.
//
// We don't compress the entries (image bytes are already compressed
// JPEG / WebP / etc., so DEFLATE saves <2% and adds a non-trivial
// dependency). The output is a standard PKZIP archive readable by
// macOS Archive Utility, Windows Explorer, unzip, 7-Zip, and friends.
//
// One CRC-32 implementation, one streaming write. ~150 lines, no deps.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** Bundle an array of named files into a STORE-only zip blob. */
export async function buildStoreZip(entries: { name: string; blob: Blob }[]): Promise<Blob> {
  const prepared: Array<ZipEntry & { crc: number; size: number; offset: number }> = [];
  let offset = 0;
  const chunks: Uint8Array[] = [];
  const encoder = new TextEncoder();

  for (const { name, blob } of entries) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const nameBytes = encoder.encode(safeName(name));
    const crc = crc32(bytes);

    // Local file header
    const header = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(header.buffer);
    dv.setUint32(0, 0x04034b50, true); // signature
    dv.setUint16(4, 20, true); // version needed
    dv.setUint16(6, 0, true); // flags
    dv.setUint16(8, 0, true); // method: STORE
    dv.setUint16(10, 0, true); // mod time
    dv.setUint16(12, 0, true); // mod date
    dv.setUint32(14, crc, true); // CRC-32
    dv.setUint32(18, bytes.length, true); // compressed size
    dv.setUint32(22, bytes.length, true); // uncompressed size
    dv.setUint16(26, nameBytes.length, true); // file name length
    dv.setUint16(28, 0, true); // extra field length
    header.set(nameBytes, 30);

    chunks.push(header, bytes);
    prepared.push({
      name: safeName(name),
      bytes,
      crc,
      size: bytes.length,
      offset,
    });
    offset += header.length + bytes.length;
  }

  // Central directory
  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;
  for (const e of prepared) {
    const nameBytes = encoder.encode(e.name);
    const cd = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.size, true);
    dv.setUint32(24, e.size, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, e.offset, true);
    cd.set(nameBytes, 46);
    centralChunks.push(cd);
    centralSize += cd.length;
  }

  // End of central directory record
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, prepared.length, true);
  eocdView.setUint16(10, prepared.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  // Concatenate into a single ArrayBuffer so the Blob constructor types
  // are happy (it doesn't accept the union of generic Uint8Arrays).
  let total = 0;
  for (const c of chunks) total += c.length;
  for (const c of centralChunks) total += c.length;
  total += eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  for (const c of centralChunks) {
    out.set(c, cursor);
    cursor += c.length;
  }
  out.set(eocd, cursor);
  const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return new Blob([buf as ArrayBuffer], { type: "application/zip" });
}

/** Reject path traversal / leading slashes; rest is left alone so users
 *  see their original file names inside the archive. */
function safeName(name: string): string {
  return name
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\.{2,}/g, ".");
}
