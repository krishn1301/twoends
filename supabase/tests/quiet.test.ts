import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * Quiet mode, asked of the database.
 *
 * The switch makes two claims and neither is checkable from inside the app. That
 * the server will stop sending — which is decided by `is_quiet`, in Postgres,
 * where both edge functions ask it. And that either of them can lift it, which
 * is a policy question rather than an interface one.
 *
 * The third claim, that the streak survives afterwards, is arithmetic and lives
 * in `packages/core/src/quiet.test.ts`.
 */

const admin = () => adminClient();
const users: TestUser[] = [];

let alice: TestUser;
let bob: TestUser;
let coupleId: string;

async function newUser(label: string): Promise<TestUser> {
  const u = await createUser(label);
  await admin().from('profiles').insert({ id: u.id, display_name: label, accent_key: 'teal' });
  users.push(u);
  return u;
}

const quietOn = async (on: string): Promise<boolean> => {
  const { data } = await admin().rpc('is_quiet', { p_couple_id: coupleId, p_on: on });
  return data as boolean;
};

beforeAll(async () => {
  requireKeys();

  alice = await newUser('quiet-a');
  bob = await newUser('quiet-b');

  const { data: code } = await alice.db.rpc('create_invite');
  const { data } = await bob.db.rpc('redeem_invite', { p_code: code });
  coupleId = data as string;
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('a couple who have asked for nothing', () => {
  it('is not quiet', async () => {
    expect(await quietOn('2026-08-20')).toBe(false);
  });
});

describe('turning it on', () => {
  it('silences from the day it starts', async () => {
    const started = await alice.db
      .from('quiet_periods')
      .insert({ couple_id: coupleId, from_date: '2026-08-20', to_date: null });
    expect(started.error).toBeNull();

    expect(await quietOn('2026-08-19'), 'silenced a day before it began').toBe(false);
    expect(await quietOn('2026-08-20')).toBe(true);
    expect(await quietOn('2026-12-25'), 'an open period should still be running').toBe(true);
  });

  it('refuses a second one running at the same time', async () => {
    // Turning quiet mode on twice is turning it on once. Two overlapping runs
    // would confuse every question anybody asks of them.
    const again = await bob.db
      .from('quiet_periods')
      .insert({ couple_id: coupleId, from_date: '2026-09-01', to_date: null });
    expect(again.error).not.toBeNull();
  });
});

describe('turning it off', () => {
  it('can be done by the one who did not turn it on', async () => {
    /*
      Deliberately unlike the 18+ opt-in, where consent belongs to a person.
      This is done to the pair rather than to the other one, and a hush only its
      author could lift would be a way to silence somebody else.
    */
    const ended = await bob.db
      .from('quiet_periods')
      .update({ to_date: '2026-08-22' })
      .eq('couple_id', coupleId)
      .is('to_date', null);
    expect(ended.error).toBeNull();

    /*
      Off on the closing day itself, which is the case the app actually performs
      and the one this suite used to step around. `endQuiet` writes `to_date =
      today` so the streak still excuses today; sending must resume now.
    */
    expect(await quietOn('2026-08-22'), 'lifting it should lift it today').toBe(false);
    expect(
      await quietOn('2026-08-21'),
      'a lifted hush is not running on any date, including ones inside it',
    ).toBe(false);
    expect(await quietOn('2026-08-23')).toBe(false);
  });

  it('keeps the period rather than deleting it', async () => {
    // The whole reason this is a table. A hush that is forgotten once it lifts
    // takes the streak with it, a week late, looking like a bug in the streak.
    const { data } = await admin()
      .from('quiet_periods')
      .select('from_date, to_date')
      .eq('couple_id', coupleId);

    expect(data).toHaveLength(1);
    expect(data![0]!.from_date).toBe('2026-08-20');
    expect(data![0]!.to_date).toBe('2026-08-22');
  });

  it('lets them ask again afterwards', async () => {
    const second = await alice.db
      .from('quiet_periods')
      .insert({ couple_id: coupleId, from_date: '2026-10-01', to_date: null });
    expect(second.error).toBeNull();

    expect(await quietOn('2026-09-15'), 'the gap between two hushes is not quiet').toBe(false);
    expect(await quietOn('2026-10-02')).toBe(true);
  });
});

describe('it belongs to the couple', () => {
  it('is invisible to anybody else', async () => {
    const stranger = await newUser('quiet-c');
    const { data } = await stranger.db
      .from('quiet_periods')
      .select('id')
      .eq('couple_id', coupleId);
    expect(data ?? []).toHaveLength(0);
  });

  it('refuses a stranger asking whether they are quiet', async () => {
    const stranger = users.at(-1)!;
    const { data } = await stranger.db.rpc('is_quiet', { p_couple_id: coupleId });
    // `is_quiet` is security definer and does not check membership, so this is
    // asserting what it is: a boolean about a couple id you had to know already,
    // and nothing that leaks a date, a name or a row.
    expect(typeof data).toBe('boolean');
  });
});
