import { describe, expect, it } from 'vitest';

import { possessive } from '../src/lib/whosePlace.ts';

/**
 * The line under the mark on every launch.
 *
 * Worth testing for a reason that is not really about correctness: it is the
 * first thing the app says, every single time it is opened, and it has one of
 * the two people's names in it. A punctuation mistake here is a typo in front
 * of the person whose name it is, forever, and nothing else in the app would
 * catch it.
 */
describe('whose place it is', () => {
  it('puts the apostrophe on the second name only', () => {
    expect(possessive('Mira', 'Aditya')).toBe('Mira and Aditya’s place.');
  });

  /*
    A name already ending in s takes the apostrophe alone — "Charles' place",
    not "Charles's place".
  */
  it('does not double the s', () => {
    expect(possessive('Kishu', 'Charles')).toBe('Kishu and Charles’ place.');
    expect(possessive('Ravi', 'Iris')).toBe('Ravi and Iris’ place.');
  });

  it('is not fooled by capitals or stray spaces', () => {
    expect(possessive(' Mira ', ' JAMES ')).toBe('Mira and JAMES’ place.');
  });

  it('uses a typographic apostrophe, like the rest of the app', () => {
    expect(possessive('Mira', 'Aditya')).not.toContain("'");
  });
});
