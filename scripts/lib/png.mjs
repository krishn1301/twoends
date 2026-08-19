import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * A very small PNG encoder.
 *
 * A PNG is a signature, three chunks and a CRC, and `node:zlib` does the only
 * hard part. Adding an image library to a project whose whole premise is zero
 * dependencies with a paid tier would be a poor trade for sixty lines.
 *
 * Extracted from `icons.mjs`, which drew the launcher mark and grew a second
 * customer when the widget previews needed the same encoder. Nothing here knows
 * anything about either — it takes RGBA bytes and returns a file.
 */

/**
 * Latin-1, which is all a `tEXt` chunk is allowed to hold.
 *
 * The dedication is written by hand in a JSON file, so it will eventually
 * contain an em dash or a curly apostrophe — every other string in this project
 * does. Those are outside Latin-1, and `Buffer.from(s, 'latin1')` truncates each
 * one to a byte of nonsense rather than failing, which would produce a file that
 * still opens and still says the wrong thing.
 *
 * Folded down rather than rejected: an icon is not worth failing a build over,
 * and "K for S -- 2026" is a fair rendering of "K for S — 2026".
 */
function latin1(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, '--')
    .replace(/–/g, '-')
    .replace(/…/g, '...')
    /*
      Anything still outside printable Latin-1 has no sensible byte; dropping it
      beats writing a byte that means something else. The range starts at 0x20
      rather than 0x00 on purpose — a stray NUL would be read as the end of the
      keyword and split one chunk into a wrong one, and no reader shows a
      newline in a tEXt chunk anyway.
    */
    .replace(/[^ -ÿ]/g, '');
}

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

/**
 * RGBA bytes in, a PNG file out.
 *
 * `text` is a list of `[keyword, value]` pairs written as `tEXt` chunks. The
 * format allows any number of them between `IHDR` and `IEND` and every reader
 * ignores the ones it does not recognise, which is exactly what makes this the
 * right place for a signature: it is in the actual bytes of the icon on both
 * phones, it costs sixty bytes, and nothing renders it.
 */
export function png(rgba, width, height, { text = [] } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte per scanline. Filter 0 (none) — the images this encodes are
  // smooth enough that deflate handles it, and it keeps the encoder honest.
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  /*
    Keyword, a null byte, then the text — no length prefix and no terminator,
    because the chunk's own length says where it ends. The spec caps the keyword
    at 79 bytes and says nothing about the value.
  */
  const texts = text.map(([keyword, value]) =>
    chunk(
      'tEXt',
      Buffer.concat([
        Buffer.from(latin1(keyword).slice(0, 79), 'latin1'),
        Buffer.from([0]),
        Buffer.from(latin1(value), 'latin1'),
      ]),
    ),
  );

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...texts,
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const write = (dir, name, buffer) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL(name, `file://${dir.replace(/\\/g, '/')}`), buffer);
  console.log(`  ${name.padEnd(28)} ${buffer.length.toString().padStart(7)} bytes`);
};
