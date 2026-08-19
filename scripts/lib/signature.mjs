import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The dedication, as PNG text chunks.
 *
 * The header of `icons.mjs` has always said that a PNG is "a signature, three
 * chunks and a CRC". This makes that literal: the mark goes into the actual
 * bytes of every icon the project generates, on the home screen of both phones
 * and in the tab of every browser that opens the site. Nothing renders it and
 * nothing costs anything for it — sixty bytes in a file that is already there.
 *
 * Read from `packages/core/content/dedication.json` rather than written here,
 * because that file is the one place these words live and a second copy would
 * be the one that never gets updated.
 *
 * **The cost, stated:** the icons are committed, so every `pnpm icons` produces
 * a binary diff. That is acceptable only because it is rare — the script runs
 * when the mark changes, which is approximately never.
 */
export function signatureText() {
  const file = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../packages/core/content/dedication.json', import.meta.url)),
      'utf8',
    ),
  );

  const { mark, line, year } = file.signature;

  return [
    ['Title', 'TwoEnds'],
    ['Dedication', `${mark} · ${line} · ${year}`],
  ];
}
