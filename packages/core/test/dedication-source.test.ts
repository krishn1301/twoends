import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isHer, isHerCouple } from '../src/dedication.ts';
import { promptsFor } from '../src/prompts.ts';

/**
 * The hash in `dedication.ts` exists for one reason: a public repository should
 * not contain a line saying "if this particular person is looking, show them a
 * love note". This is the test that says so, because a comment claiming it would
 * survive somebody pasting the id back in for five minutes of debugging and then
 * forgetting.
 *
 * It reads the file, which is why it lives here rather than beside the module —
 * `src/*.test.ts` compiles with `types: []` and has no `node:fs`.
 */

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/*
  The two real ids. Written here, in a test, on purpose: this file is the one
  place they are allowed to appear, and having them somewhere is what makes both
  assertions below possible at all.
*/
const HERS = '20a5cf9c-3745-4ad9-aa80-7cc44e19edd1';
const HIS = '62bc550f-2d80-47e1-ba0a-08e82f446db2';

describe('the private layer keeps its plaintext out of the source', () => {
  for (const file of ['../src/dedication.ts', '../src/dedication.test.ts', '../content/dedication.json']) {
    it(`${file} contains no profile id`, () => {
      const source = read(file);
      for (const id of [HERS, HIS]) {
        expect(source, `${id} is in ${file}`).not.toContain(id);
      }
    });
  }

  it('the content file names nobody', () => {
    /*
      The signature is initials by explicit instruction — "not my name, both of
      ours". Her full name appearing in a file that ships to every user would be
      a different decision from the one that was made, and it would arrive by
      accident rather than on purpose.
    */
    const content = read('../content/dedication.json').toLowerCase();
    for (const name of ['sanskruti', 'krishn']) {
      expect(content, `${name} is in the content file`).not.toContain(name);
    }
  });
});

describe('the hash is the right person', () => {
  /*
    `HERS` in `dedication.ts` is an opaque string that no reader can check by
    eye, which is the point — and also means a single mistyped character would
    close the private layer forever with nothing failing anywhere. These two
    assertions are the only thing standing between "obfuscated" and "broken".
  */
  it('opens for her', () => {
    expect(isHer(HERS)).toBe(true);
  });

  it('stays shut for him, who is the nearest possible false positive', () => {
    expect(isHer(HIS)).toBe(false);
  });

  it('opens for their couple from either side of it', () => {
    // The daily question is derived against a list of prompts, so both phones
    // must build the same list. Whichever of the two is `member_a` on a given
    // couple row, the answer has to be the same.
    expect(isHerCouple(HERS, HIS)).toBe(true);
    expect(isHerCouple(HIS, HERS)).toBe(true);
    expect(isHerCouple(HIS, null)).toBe(false);
  });
});

describe('the private pack does not desynchronise the two phones', () => {
  /*
    The failure this guards against does not look like a bug. Both phones open,
    both show a question, neither shows an error — and the questions are
    different, so neither answer ever unlocks the other and the day just quietly
    never completes. It would have been introduced by gating on the reader
    rather than on the couple, which is the obvious way to write it.
  */
  const ordinary = promptsFor({});

  it('adds questions for their couple and nobody else', () => {
    const theirs = promptsFor({ hasHer: isHerCouple(HERS, HIS) });
    expect(theirs.length).toBeGreaterThan(ordinary.length);
    expect(promptsFor({ hasHer: isHerCouple(HIS, null) })).toEqual(ordinary);
  });

  it('builds the identical list from either side of the couple row', () => {
    const fromHerSide = promptsFor({ hasHer: isHerCouple(HERS, HIS) });
    const fromHisSide = promptsFor({ hasHer: isHerCouple(HIS, HERS) });
    expect(fromHerSide.map((p) => p.id)).toEqual(fromHisSide.map((p) => p.id));
  });
});
