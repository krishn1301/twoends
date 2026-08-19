import { describe, expect, it } from 'vitest';

import { classify, couplesDestroyedBy } from './sweep.mjs';

/*
  The real shapes, minimally. Ids are made up; the point of every test here is
  the *rule*, and the one thing the rule must never do is delete somebody.
*/
const user = (id, email = null) => ({ id, email });

describe('who a sweep may delete', () => {
  it('takes the leak suite, which is the whole reason to sweep', () => {
    const [row] = classify({ users: [user('a', 'pair-3f2a91cd@twoends.test')] });
    expect(row.verdict).toBe('test');
  });

  it('keeps anybody with a real address', () => {
    const rows = classify({
      users: [user('a', 'someone@gmail.com'), user('b', 'other@example.org')],
    });
    expect(rows.map((r) => r.verdict)).toEqual(['keep', 'keep']);
  });

  it('keeps an anonymous account that has a profile', () => {
    /*
      Not a hypothetical. Three of the people in the dev project are anonymous
      and paired, and one of them is the `member_a` whose deletion would take a
      real couple down with it. "Anonymous means disposable" is the assumption
      that would have deleted them.
    */
    const [row] = classify({
      users: [user('anon')],
      profiles: [{ id: 'anon', display_name: 'sweetaaaa' }],
    });
    expect(row.verdict).toBe('keep');
  });

  it('keeps an anonymous account in a couple even with no profile row', () => {
    const [row] = classify({
      users: [user('anon')],
      couples: [{ id: 'c1', member_a: 'anon', member_b: null }],
    });
    expect(row.verdict).toBe('keep');
  });

  it('takes an anonymous account with nothing attached to it at all', () => {
    // What a fresh APK install leaves behind before anybody types a name.
    const [row] = classify({ users: [user('fresh')] });
    expect(row.verdict).toBe('abandoned');
  });

  it('never marks somebody with a real email, whatever else is true of them', () => {
    const rows = classify({
      users: [user('a', 'real@gmail.com'), user('b', 'also@real.com')],
      profiles: [],
      couples: [],
    });
    for (const row of rows) expect(row.verdict, row.email).toBe('keep');
  });
});

describe('the cascade check', () => {
  it('names the couples a deletion would destroy', () => {
    const couples = [
      { id: 'c1', member_a: 'x', member_b: 'y' },
      { id: 'c2', member_a: 'y', member_b: 'z' },
    ];
    expect(couplesDestroyedBy(['x'], couples).map((c) => c.id)).toEqual(['c1']);
  });

  it('says nothing about member_b, which only empties the slot', () => {
    const couples = [{ id: 'c1', member_a: 'x', member_b: 'y' }];
    expect(couplesDestroyedBy(['y'], couples)).toEqual([]);
  });

  it('is empty for everything classify is willing to delete', () => {
    /*
      The assertion that ties the two functions together, and the one worth
      having: anything marked deletable must be provably unable to take a couple
      with it. If this ever fails, the rule is wrong and the script must stop
      rather than proceed carefully.
    */
    const users = [
      user('suite', 'pair-1@twoends.test'),
      user('fresh'),
      user('real', 'someone@gmail.com'),
      user('anon'),
    ];
    const profiles = [{ id: 'anon' }, { id: 'real' }];
    const couples = [{ id: 'c1', member_a: 'anon', member_b: 'real' }];

    const doomed = classify({ users, profiles, couples })
      .filter((r) => r.verdict !== 'keep')
      .map((r) => r.id);

    expect(doomed.sort()).toEqual(['fresh', 'suite']);
    expect(couplesDestroyedBy(doomed, couples)).toEqual([]);
  });
});
