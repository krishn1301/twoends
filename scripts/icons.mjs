#!/usr/bin/env node
/**
 * Generates the app icons.
 *
 * The mark is two discs, overlapping, with the overlap brighter than either of
 * them. That is the product in one shape: two people, one shared space, and the
 * shared space is the point. Deliberately not a heart — every couple app on the
 * store is a heart, and a heart says nothing about what this one does.
 *
 * The Android adaptive icon is a vector and lives in
 * `apps/web/android/.../drawable/ic_launcher_foreground.xml`. This script draws
 * the identical geometry as pixels, for the places that cannot take a vector:
 * the PWA manifest, the favicon, iOS's home screen, and Android 7's launcher.
 * The two must be changed together — the numbers below are the same numbers.
 *
 * Written by hand rather than pulled from a design tool because the mark is
 * three circles of maths, and because it means the icon regenerates from source:
 * changing the accent pair is an edit here, not a hunt through binary files.
 *
 * A minimal PNG encoder lives at the bottom. PNGs are a signature, three chunks
 * and a CRC, and `node:zlib` does the only hard part. Adding an image library to
 * a project whose whole premise is zero dependencies with a paid tier would be a
 * poor trade for 60 lines.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../apps/web/public/', import.meta.url));
const RES = fileURLToPath(new URL('../apps/web/android/app/src/main/res/', import.meta.url));

/*
  Coral and iris, straight out of packages/core/accents.ts.

  They are 112 degrees apart on the wheel *and* different in lightness, which is
  the rule those twelve accents are generated under — hue alone is not enough to
  keep two colours apart for a colourblind eye.

  The lens is the screen blend of the two, computed rather than picked:
  1-(1-a)(1-b) per channel. Light is what you get when both are present.
*/
const CORAL = [0xe8, 0x6c, 0x46];
const IRIS = [0x98, 0x6c, 0xe5];
const LENS = [0xf6, 0xa9, 0xec];
const VOID = [0x00, 0x00, 0x00];

/*
  Geometry, normalised. Identical to the 108-unit vector: discs of r=22 centred
  at x=43 and x=65 on y=54, so the mark spans exactly the 66 units an adaptive
  icon is allowed to treat as safe. Keeping the pixel version to the same
  proportion is what makes the launcher icon and the PWA icon read as one mark.
*/
const R = 22 / 108;
const CX_A = 43 / 108;
const CX_B = 65 / 108;
const CY = 54 / 108;

/**
 * Four samples per axis, sixteen per pixel.
 *
 * Circles are the one shape where aliasing is unmissable, and at 32px — the
 * favicon — a hard-edged disc looks broken rather than retro. Supersampling is
 * the whole anti-aliasing implementation.
 */
const SS = 4;

function render(size, { round = false } = {}) {
  const px = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const sample = colourAt(u, v, round);

          r += sample[0] * sample[3];
          g += sample[1] * sample[3];
          b += sample[2] * sample[3];
          a += sample[3];
        }
      }

      const i = (y * size + x) * 4;
      // Un-premultiply. Averaging colour without weighting by coverage would
      // give the transparent edge a dark fringe on a light wallpaper.
      px[i] = a > 0 ? Math.round(r / a) : 0;
      px[i + 1] = a > 0 ? Math.round(g / a) : 0;
      px[i + 2] = a > 0 ? Math.round(b / a) : 0;
      px[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }

  return png(px, size, size);
}

function colourAt(u, v, round) {
  // A round icon is masked to a circle; everything outside it must be
  // transparent, not black, or the launcher draws a black square behind it.
  if (round && Math.hypot(u - 0.5, v - 0.5) > 0.5) return [0, 0, 0, 0];

  const inA = Math.hypot(u - CX_A, v - CY) <= R;
  const inB = Math.hypot(u - CX_B, v - CY) <= R;

  if (inA && inB) return [...LENS, 1];
  if (inA) return [...CORAL, 1];
  if (inB) return [...IRIS, 1];
  return [...VOID, 1];
}

// ── a very small PNG encoder ─────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte per scanline. Filter 0 (none) — the image is smooth enough
  // that deflate handles it, and this keeps the encoder honest.
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── emit ─────────────────────────────────────────────────────────────────────

const write = (dir, name, buffer) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(name, `file://${dir.replace(/\\/g, '/')}`), buffer);
  console.log(`  ${name.padEnd(24)} ${buffer.length.toString().padStart(7)} bytes`);
};

console.log('web');
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  // iOS ignores the manifest for the home-screen icon and uses this one.
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]) {
  write(WEB, name, render(size));
}

/*
  Android 7 only.

  Every launcher from Android 8 onwards uses the adaptive icon, which is a
  vector and not built here. These exist so the one remaining API level below
  that does not fall back to a blank square — minSdk is 24.
*/
console.log('android (legacy, API 24-25)');
for (const [density, size] of [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
]) {
  const dir = `${RES}mipmap-${density}/`;
  write(dir, 'ic_launcher.png', render(size));
  write(dir, 'ic_launcher_round.png', render(size, { round: true }));
}
