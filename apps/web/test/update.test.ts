import { describe, expect, it } from 'vitest';

import { isNewer } from '../src/lib/update.ts';

/**
 * Which of two releases is newer.
 *
 * Tested because it is the one piece of the update check that can be quietly
 * wrong: everything else either works or fails loudly, and this can sit there
 * for a year telling somebody they are up to date. The classic way to get it
 * wrong is a string compare, which puts 1.0.9 above 1.0.10 and stops offering
 * updates exactly when the tenth patch ships.
 */
describe('isNewer', () => {
  it('compares numbers, not strings', () => {
    expect(isNewer('1.0.10', '1.0.9')).toBe(true);
    expect(isNewer('1.0.9', '1.0.10')).toBe(false);
    expect(isNewer('1.10.0', '1.9.0')).toBe(true);
    expect(isNewer('2.0.0', '1.99.99')).toBe(true);
  });

  it('does not care about the leading v', () => {
    expect(isNewer('v1.0.8', '1.0.7')).toBe(true);
    expect(isNewer('v1.0.8', 'v1.0.8')).toBe(false);
    expect(isNewer('1.0.7', 'v1.0.8')).toBe(false);
  });

  it('treats a missing segment as zero', () => {
    expect(isNewer('1.1', '1.0.9')).toBe(true);
    expect(isNewer('1.0', '1.0.0')).toBe(false);
    expect(isNewer('1.0.0', '1.0')).toBe(false);
  });

  /*
    A local build calls itself `dev`. Telling somebody running one to go and
    download a release is worse than saying nothing, and the same goes for a
    tag nobody managed to parse — an update prompt that cannot be satisfied is
    a permanent one.
  */
  it('never reports an update against an unparseable version', () => {
    expect(isNewer('1.0.8', 'dev')).toBe(false);
    expect(isNewer('nightly', '1.0.8')).toBe(false);
    expect(isNewer('', '1.0.8')).toBe(false);
    expect(isNewer('1.0.8', '')).toBe(false);
  });

  it('is false for the version you are already on', () => {
    expect(isNewer('1.0.8', '1.0.8')).toBe(false);
  });
});
