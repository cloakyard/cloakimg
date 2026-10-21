import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "/tmp/cloakyard-rollout-2026-10-21/";
const old = await (
  await import(root + "cloakimg-baseline/src/editor/vendor/heif-codec.js")
).default();
const fresh = await (
  await import(root + "cloakimg-clean/src/editor/vendor/heif-codec.js")
).default();
const sha = (b) => createHash("sha256").update(b).digest("hex");
const decode = (codec, b) => {
  const r = codec.jsDecodeImage(b);
  assert.equal(r.err, "");
  const d = r.data[0];
  return { width: d.width, height: d.height, rgba: new Uint8Array(d.data) };
};
const fixture = await readFile(root + "cloakimg-clean/test-fixtures/IMG_1804.heic");
const a = decode(old, fixture),
  b = decode(fresh, fixture);
assert.deepEqual(b, a, "real HEIC decode preserves every pixel");
const results = {
  realHeic: { width: b.width, height: b.height, rgbaSha256: sha(b.rgba), equal: true },
  roundTrips: [],
};
for (const [w, h] of [
  [8, 6],
  [32, 24],
  [256, 192],
])
  for (const q of [20, 80, 95]) {
    const pixels = new Uint8Array(w * h * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      const p = i / 4;
      pixels[i] = (p * 31) % 256;
      pixels[i + 1] = (p * 17) % 256;
      pixels[i + 2] = (p * 7) % 256;
      pixels[i + 3] = 255;
    }
    const encoded = [];
    for (const c of [old, fresh]) {
      const v = c.jsEncodeImage(pixels, w, h, q);
      assert.equal(v.err, "");
      const bytes = new Uint8Array(v.data);
      assert.equal(String.fromCharCode(...bytes.subarray(4, 12)), "ftypheic");
      encoded.push(bytes);
    }
    const d = decode(old, encoded[0]),
      e = decode(fresh, encoded[1]);
    assert.deepEqual(e, d, "HEIC export round-trip preserves decoded pixels");
    assert.equal(e.width, w);
    assert.equal(e.height, h);
    results.roundTrips.push({
      width: w,
      height: h,
      quality: q,
      beforeBytes: encoded[0].length,
      afterBytes: encoded[1].length,
      encodedBytesEqual: Buffer.compare(encoded[0], encoded[1]) === 0,
      rgbaEqual: true,
      rgbaSha256: sha(e.rgba),
    });
  }
await writeFile(root + "cloakimg/codec-comparison.json", JSON.stringify(results, null, 2) + "\n");
console.log("Original HEIC decode and 9 actual export round-trips preserve every RGBA pixel.");
