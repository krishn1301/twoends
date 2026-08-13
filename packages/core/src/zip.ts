/**
 * A very small ZIP writer.
 *
 * The export promise is that the data belongs to the couple — one tap, a file
 * they can keep, readable without this app ever existing. A ZIP of JSON plus
 * the original media is the most boring possible way to honour that, and boring
 * is the point: it opens in Explorer, in Finder, in Files on a phone, and in
 * every language anyone might later want to read it with.
 *
 * Written by hand rather than pulled in, for the same reason as the PNG encoder
 * in `scripts/icons.mjs`: the format is a handful of little-endian structs, and
 * a dependency in a project whose premise is zero dependencies with a paid tier
 * would be a poor trade for a hundred lines.
 *
 * Deflate is *not* implemented here. The platform already has it — the browser
 * as `CompressionStream('deflate-raw')`, Node as `zlib.deflateRaw` — and this
 * package is not allowed to reach for either. So the caller compresses and
 * passes the result in; entries without one are stored uncompressed, which is
 * the right answer for the media anyway since a JPEG does not compress twice.
 */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes, no leading slash. */
  name: string;
  /** The bytes as they should come back out. */
  body: Uint8Array;
  /**
   * `body` run through raw deflate, when the caller could. Used only if it is
   * actually smaller — compression that grows a file is a bug, not a feature.
   */
  deflated?: Uint8Array;
  /** Modification time. Defaults to the epoch DOS can represent, not to "now",
   *  so building the same export twice produces identical bytes. */
  modified?: Date;
}

const STORED = 0;
const DEFLATED = 8;

/** ZIP counts from 1980, and has no room for a year before it. */
const DOS_EPOCH = new Date(1980, 0, 1, 0, 0, 0);

export function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];

  let offset = 0;
  let count = 0;

  for (const entry of entries) {
    const name = utf8(entry.name);
    const useDeflate = entry.deflated != null && entry.deflated.length < entry.body.length;
    const payload = useDeflate ? entry.deflated! : entry.body;
    const method = useDeflate ? DEFLATED : STORED;
    const crc = crc32(entry.body);
    const { time, date } = dosStamp(entry.modified ?? DOS_EPOCH);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed: 2.0, which is all deflate wants
    // Bit 11 marks the name as UTF-8. Without it a non-ASCII caption in a
    // filename is decoded as the reader's local codepage, which is how exports
    // grow mojibake.
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, entry.body.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true); // no extra field
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header signature
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, payload.length, true);
    cv.setUint32(24, entry.body.length, true);
    cv.setUint16(28, name.length, true);
    // 30..36 stay zero: no extra field, no comment, disk 0, no attributes.
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, payload);
    centrals.push(central);
    offset += local.length + payload.length;
    count += 1;
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0);

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory signature
  ev.setUint16(8, count, true);
  ev.setUint16(10, count, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return concat([...locals, ...centrals, end]);
}

/**
 * UTF-8, by hand.
 *
 * `TextEncoder` is a global in every runtime this will ever meet, but it is not
 * in `lib: ["ES2022"]` — and `packages/core` sets `types: []` precisely so that
 * reaching for a platform global fails to compile rather than quietly working
 * until the Kotlin port. Twenty lines is the price of that rule holding, and
 * filenames are the only strings this file encodes.
 *
 * Surrogate pairs are joined back into one code point; a lone surrogate becomes
 * U+FFFD rather than an invalid byte sequence, because a ZIP with a malformed
 * name is one some readers reject outright.
 */
function utf8(text: string): Uint8Array {
  const out: number[] = [];

  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      } else {
        code = 0xfffd;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      code = 0xfffd;
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }

  return new Uint8Array(out);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/**
 * MS-DOS date and time, which is what ZIP stores: two-second resolution, and a
 * year counted from 1980. Anything earlier is clamped rather than wrapped —
 * a negative year field produces a file most readers refuse outright.
 */
function dosStamp(when: Date): { time: number; date: number } {
  const at = when < DOS_EPOCH ? DOS_EPOCH : when;
  const time =
    (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2);
  const date =
    ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  return { time, date };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
