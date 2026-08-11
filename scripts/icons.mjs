#!/usr/bin/env node
/**
 * Generates the app icons.
 *
 * Written by hand rather than pulled from a design tool because the mark is one
 * idea — two colours meeting on a diagonal — and that idea is three lines of
 * maths. It also means the icon regenerates from source, so changing the accent
 * pair later is an edit here rather than a hunt through binary files.
 *
 * A minimal PNG encoder lives at the bottom: PNGs are a signature, three chunks
 * and a CRC, and `node:zlib` does the only hard part. Adding an image library to
 * a project whose whole premise is zero dependencies with a paid tier would be a
 * poor trade for 60 lines.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../apps/web/public/', import.meta.url));
mkdirSync(OUT, { recursive: true });

// The default pair. Same values as `teal` and `rose` in packages/core/accents.
const MINE = [0x30, 0xc2, 0xbd];
const THEIRS = [0xe4, 0x56, 0x6e];
const INK = [0x0d, 0x0b, 0x0a];

/**
 * Renders the mark: an ink field with a soft diagonal where the two accents
 * meet. `inset` keeps the mark clear of the corners iOS rounds off.
 */
function render(size) {
  const px = Buffer.alloc(size * size * 3);
  const inset = Math.round(size * 0.16);
  const span = size - inset * 2;
  // How wide the blend between the two colours is, in pixels.
  const blend = Math.max(2, size * 0.06);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      let colour = INK;

      const inMark = x >= inset && x < size - inset && y >= inset && y < size - inset;
      if (inMark) {
        // Distance from the diagonal running corner to corner through the mark.
        const u = (x - inset) / span;
        const v = (y - inset) / span;
        const d = (u + v - 1) * span * 0.7071;

        const t = Math.max(0, Math.min(1, d / blend + 0.5));
        colour = [
          Math.round(MINE[0] + (THEIRS[0] - MINE[0]) * t),
          Math.round(MINE[1] + (THEIRS[1] - MINE[1]) * t),
          Math.round(MINE[2] + (THEIRS[2] - MINE[2]) * t),
        ];
      }

      px[i] = colour[0];
      px[i + 1] = colour[1];
      px[i + 2] = colour[2];
    }
  }
  return png(px, size, size);
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

function png(rgb, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte per scanline. Filter 0 (none) — the image is smooth enough
  // that deflate handles it, and this keeps the encoder honest.
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── emit ─────────────────────────────────────────────────────────────────────

const SIZES = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  // iOS ignores the manifest for the home-screen icon and uses this one.
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
];

for (const [name, size] of SIZES) {
  writeFileSync(new URL(name, `file://${OUT.replace(/\\/g, '/')}`), render(size));
  console.log(`${name.padEnd(22)} ${size}×${size}`);
}
