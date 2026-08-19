import { describe, expect, it } from 'vitest';

import {
  COLOPHON,
  SIGNATURE,
  heldCopy,
  herLine,
  herPrompts,
  isHer,
  isHerCouple,
  isWritten,
  occasionCopy,
} from './dedication.ts';

describe('the signature', () => {
  it('is both of them, not one of them', () => {
    // The whole instruction was "not my name — both of ours".
    expect(SIGNATURE.mark).toMatch(/\bfor\b/);
    expect(SIGNATURE.mark.length).toBeLessThan(20);
  });

  it('is written, because it ships to everybody', () => {
    expect(isWritten(SIGNATURE.mark)).toBe(true);
    expect(isWritten(SIGNATURE.line)).toBe(true);
  });
});

describe('the colophon', () => {
  it('makes every promise the app actually makes', () => {
    const all = COLOPHON.promises.map((p) => `${p.title} ${p.body}`.toLowerCase()).join(' ');

    // Each of these is a real guarantee enforced somewhere in the codebase, and
    // a page that claims to list them while missing one is worse than no page.
    expect(all).toMatch(/free/);
    expect(all).toMatch(/delet/);
    expect(all).toMatch(/location/);
    expect(all).toMatch(/analytics|tracking/);
  });

  it('is written in words rather than in schema', () => {
    // This is read by somebody's girlfriend, not by a reviewer. If these terms
    // ever appear here, the page has drifted back into being documentation.
    const all = `${COLOPHON.opening} ${COLOPHON.promises.map((p) => p.body).join(' ')}`;
    for (const jargon of ['RLS', 'policy', 'Postgres', 'restrictive', 'migration', 'Supabase']) {
      expect(all, `${jargon} does not belong on this page`).not.toContain(jargon);
    }
  });

  it('has every promise written', () => {
    for (const promise of COLOPHON.promises) {
      expect(isWritten(promise.title), promise.title).toBe(true);
      expect(isWritten(promise.body), promise.title).toBe(true);
    }
  });
});

describe('unwritten copy', () => {
  /*
    The words that are his to write are drafted rather than final, and the app
    has to behave correctly in either state — a string he blanks back to TODO
    must disappear rather than appear as a placeholder. It would be a poor joke
    for the first anniversary card to read TODO.
  */
  it('reads as absent rather than as a placeholder', () => {
    expect(isWritten('TODO — something')).toBe(false);
    expect(isWritten('  TODO')).toBe(false);
    expect(isWritten('Today of all days')).toBe(true);
  });

  it('means an occasion has no card at all', () => {
    for (const kind of ['anniversary', 'birthday', 'milestone', 'minute']) {
      const copy = occasionCopy(kind);
      if (copy !== null) expect(isWritten(copy.line)).toBe(true);
    }
  });

  it('means the held counter says nothing', () => {
    const held = heldCopy();
    if (held !== null) expect(isWritten(held)).toBe(true);
  });

  it('drops unwritten questions rather than asking them', () => {
    for (const prompt of herPrompts()) expect(isWritten(prompt.body)).toBe(true);
  });

  it('means her line is absent rather than empty', () => {
    const line = herLine();
    if (line !== null) expect(isWritten(line)).toBe(true);
  });

  it('leaves an unknown occasion alone', () => {
    expect(occasionCopy('nothing-like-this')).toBeNull();
  });
});

describe('the private layer', () => {
  /*
    That the check opens for her and stays shut for him is asserted in
    `test/dedication-source.test.ts`, which is the one file allowed to hold the
    two real ids and says why. Repeating them here would put them in the file
    directly beside the module the hash exists to keep them out of, which is the
    whole thing this was built to avoid.

    What is left here is the behaviour that needs no identity to check.
  */
  it('is closed to anyone it was not written for', () => {
    expect(isHer('00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(isHer('ffffffff-ffff-4fff-8fff-ffffffffffff')).toBe(false);
    expect(isHer(null)).toBe(false);
    expect(isHer(undefined)).toBe(false);
    expect(isHer('')).toBe(false);
  });

  it('is closed to a couple neither of whom is her', () => {
    expect(isHerCouple('00000000-0000-4000-8000-000000000000', null)).toBe(false);
    expect(isHerCouple(null, null)).toBe(false);
    expect(isHerCouple(undefined, undefined)).toBe(false);
  });
});

describe('her questions', () => {
  it('carry the pack they are filtered by', () => {
    for (const prompt of herPrompts()) expect(prompt.pack).toBe('hers');
  });

  it('are never adult, because that gate is a different one', () => {
    for (const prompt of herPrompts()) expect(prompt.isAdult).toBe(false);
  });

  it('have stable ids, so answering one twice is the same question', () => {
    // Ids come from the text, exactly as the shipped packs do. That is what
    // lets both phones agree offline about which question today is.
    const once = herPrompts().map((p) => p.id);
    const twice = herPrompts().map((p) => p.id);
    expect(once).toEqual(twice);
    expect(new Set(once).size).toBe(once.length);
  });
});
