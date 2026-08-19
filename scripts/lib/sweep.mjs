/**
 * Who a sweep of the development project may delete, and who it may not.
 *
 * This exists because `wipe:dev` was written when the dev project held nothing
 * but fixtures, and it now holds three real couples — four months of one
 * relationship, fifteen canvases of another. Its only guard was
 * `SUPABASE_ENV=development`, which is permanently set because `pnpm test:rls`
 * refuses to run without it. So the guard had stopped guarding anything.
 *
 * The rule is inverted from what it was. It used to be *delete everyone*; it is
 * now *delete only what we can prove we made ourselves*, and anything that does
 * not match is printed and left alone. A sweep that spares too much costs a few
 * dead rows. A sweep that spares too little cannot be undone.
 *
 * Pure, and separate from the script that calls it, so the decision can be
 * tested — see `sweep.test.mjs`. The alternative is finding out on live data.
 */

/** The domain `supabase/tests/helpers.ts` mints its users under. */
export const TEST_DOMAIN = '@twoends.test';

/**
 * Sort every account into what may happen to it.
 *
 * - `test` — made by the leak suite. About forty per run, and they accumulate.
 * - `abandoned` — an anonymous account with no profile and no couple. A fresh
 *   APK install mints one of these *before the person types anything*, so they
 *   are the residue of installing the app, not of using it.
 * - `keep` — everything else, including every anonymous account that got as far
 *   as a name. Three of the real people here have no email at all; "anonymous
 *   means disposable" is the assumption that would delete them.
 */
export function classify({ users, profiles = [], couples = [] }) {
  const hasProfile = new Set(profiles.map((p) => p.id));

  const inCouple = new Set();
  for (const couple of couples) {
    if (couple.member_a) inCouple.add(couple.member_a);
    if (couple.member_b) inCouple.add(couple.member_b);
  }

  return users.map((user) => {
    const email = user.email ?? null;

    if (email?.endsWith(TEST_DOMAIN)) {
      return { id: user.id, email, verdict: 'test', why: 'made by the leak suite' };
    }

    if (email) {
      return { id: user.id, email, verdict: 'keep', why: 'has a real email address' };
    }

    if (hasProfile.has(user.id)) {
      return { id: user.id, email, verdict: 'keep', why: 'anonymous, but has a profile' };
    }

    if (inCouple.has(user.id)) {
      // Belt and braces: a couple row referencing a profile that does not exist
      // should be impossible, and this is not the place to find out otherwise.
      return { id: user.id, email, verdict: 'keep', why: 'anonymous, but is in a couple' };
    }

    return { id: user.id, email, verdict: 'abandoned', why: 'no email, no profile, no couple' };
  });
}

/**
 * The couples a deletion would take with it.
 *
 * `profiles.id references auth.users on delete cascade` and `couples.member_a
 * references profiles on delete cascade`, so deleting one account can take a
 * whole couple row and everything keyed to its `couple_id` — including a paired
 * partner who has an email and did nothing wrong. `member_b` is
 * `on delete set null` and merely empties the slot.
 *
 * Nothing `classify` marks for deletion should ever appear here. That is exactly
 * why the caller checks: if this ever returns anything, the rule above is wrong
 * and the run must stop rather than proceed carefully.
 */
export function couplesDestroyedBy(doomedIds, couples = []) {
  const doomed = new Set(doomedIds);
  return couples.filter((c) => doomed.has(c.member_a));
}
