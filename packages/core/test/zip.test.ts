import { deflateRawSync, inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { buildZip, crc32 } from '../src/zip.ts';

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const u32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);
const u16 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint16(at, true);

/**
 * A reader built from the spec rather than from `buildZip`, so the test does
 * not simply agree with the code that produced the file. It walks the central
 * directory — which is how a real unzipper finds entries — instead of scanning
 * local headers, so a wrong offset or a wrong central size shows up here.
 *
 * The output has also been opened by Windows' own Expand-Archive, which is the
 * check this file cannot make: that a real implementation accepts it.
 */
function readZip(archive: Uint8Array): Map<string, { body: Uint8Array; method: number }> {
  const end = archive.length - 22;
  expect(u32(archive, end)).toBe(0x06054b50);

  const count = u16(archive, end + 10);
  let at = u32(archive, end + 16);

  const out = new Map<string, { body: Uint8Array; method: number }>();
  for (let i = 0; i < count; i++) {
    expect(u32(archive, at)).toBe(0x02014b50);
    const method = u16(archive, at + 10);
    const crc = u32(archive, at + 16);
    const compressed = u32(archive, at + 20);
    const uncompressed = u32(archive, at + 24);
    const nameLength = u16(archive, at + 28);
    const localAt = u32(archive, at + 42);
    const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength));

    expect(u32(archive, localAt)).toBe(0x04034b50);
    const localNameLength = u16(archive, localAt + 26);
    const extraLength = u16(archive, localAt + 28);
    const dataAt = localAt + 30 + localNameLength + extraLength;
    const raw = archive.subarray(dataAt, dataAt + compressed);

    const body = method === 8 ? new Uint8Array(inflateRawSync(raw)) : raw;
    expect(body.length).toBe(uncompressed);
    expect(crc32(body)).toBe(crc);

    out.set(name, { body, method });
    at += 46 + nameLength + u16(archive, at + 30) + u16(archive, at + 32);
  }
  return out;
}

describe('crc32', () => {
  it('matches the published check value', () => {
    // The standard CRC-32 test vector: "123456789" is 0xCBF43926.
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for no bytes', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('buildZip', () => {
  it('round-trips several stored entries', () => {
    const archive = buildZip([
      { name: 'data.json', body: bytes('{"a":1}') },
      { name: 'media/one.jpg', body: bytes('not really a jpeg') },
    ]);

    const read = readZip(archive);
    expect([...read.keys()]).toEqual(['data.json', 'media/one.jpg']);
    expect(new TextDecoder().decode(read.get('data.json')!.body)).toBe('{"a":1}');
    expect(read.get('media/one.jpg')!.method).toBe(0);
  });

  it('uses a deflated payload when it is smaller, and inflates back', () => {
    const body = bytes('x'.repeat(4000));
    // Not produced by core, which may not import zlib. The app passes in what
    // CompressionStream gave it, and this stands in for that.
    const deflated = new Uint8Array(deflateRawSync(Buffer.from(body)));

    const read = readZip(buildZip([{ name: 'big.txt', body, deflated }]));
    expect(read.get('big.txt')!.method).toBe(8);
    expect(read.get('big.txt')!.body).toEqual(body);
  });

  it('refuses a deflated payload that is larger than the original', () => {
    const body = bytes('tiny');
    const deflated = new Uint8Array(200);
    const read = readZip(buildZip([{ name: 'tiny.txt', body, deflated }]));
    // Compression that grows the file is a bug to ignore, not a mode to honour.
    expect(read.get('tiny.txt')!.method).toBe(0);
    expect(read.get('tiny.txt')!.body).toEqual(body);
  });
});

/**
 * The hand-rolled UTF-8 encoder in zip.ts.
 *
 * It exists because core sets `types: []` so that reaching for a platform
 * global fails to compile. That makes it code nobody else has reviewed, which
 * makes these the tests that matter most in this file.
 */
describe('filename encoding', () => {
  it('handles one, two, three and four-byte code points', () => {
    // 'é' is two bytes, the coffee is three, and the globe is a surrogate pair
    // that must be recombined into one four-byte code point.
    const name = 'media/café ☕ 🌍.txt';
    const read = readZip(buildZip([{ name, body: bytes('ok') }]));
    expect([...read.keys()]).toEqual([name]);
  });

  it('replaces a lone high surrogate rather than emitting invalid bytes', () => {
    const read = readZip(buildZip([{ name: 'bad\uD800.txt', body: bytes('ok') }]));
    expect([...read.keys()]).toEqual(['bad�.txt']);
  });

  it('replaces a lone low surrogate too', () => {
    const read = readZip(buildZip([{ name: 'bad\uDC00.txt', body: bytes('ok') }]));
    expect([...read.keys()]).toEqual(['bad�.txt']);
  });

  it('agrees with TextEncoder on a wide sample', () => {
    // The strongest available check: the platform's own encoder is the oracle.
    const sample = 'aé☕🌍中Ж ~!@#$%^&*()_+ üßå';
    const read = readZip(buildZip([{ name: sample, body: bytes('x') }]));
    expect([...read.keys()]).toEqual([sample]);
  });
});

describe('archive shape', () => {
  it('is byte-identical when built twice', () => {
    // No implicit `now()` anywhere, so an export can be diffed against the one
    // taken last month and only the data shows up as changed.
    const make = () => buildZip([{ name: 'a.txt', body: bytes('same') }]);
    expect(make()).toEqual(make());
  });

  it('produces a valid empty archive', () => {
    const archive = buildZip([]);
    expect(archive.length).toBe(22);
    expect(readZip(archive).size).toBe(0);
  });

  it('clamps a date ZIP cannot represent instead of wrapping it', () => {
    const archive = buildZip([
      { name: 'old.txt', body: bytes('x'), modified: new Date(1970, 0, 1) },
    ]);
    // The year field is (year - 1980) << 9; 1970 would go negative and corrupt
    // the month and day beside it.
    expect(u16(archive, 12) >> 9).toBe(0);
    expect(readZip(archive).size).toBe(1);
  });
});
