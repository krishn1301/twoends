import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * The 18+ opt-in, asked of the database rather than of the app.
 *
 * The rule is that both people turn it on and either can turn it back off
 * alone, and there are two ways an implementation of that can be quietly wrong.
 * One is that a person can set the flag for their partner. The other is that
 * `couples.adult_packs_enabled` drifts from the two opt-ins it is supposed to be
 * derived from — and since that column is what every client gates content on, a
 * drift there serves the packs to a couple where somebody said no.
 *
 * Neither can be tested from inside the app, so they are tested here.
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

const enabled = async (): Promise<boolean> => {
  const { data } = await admin()
    .from('couples')
    .select('adult_packs_enabled')
    .eq('id', coupleId)
    .single();
  return data!.adult_packs_enabled as boolean;
};

const optIn = (who: TestUser, on: boolean) =>
  who.db
    .from('profiles')
    .update({ adult_opt_in_at: on ? new Date().toISOString() : null })
    .eq('id', who.id);

beforeAll(async () => {
  requireKeys();

  alice = await newUser('adult-a');
  bob = await newUser('adult-b');

  const { data: code } = await alice.db.rpc('create_invite');
  const { data } = await bob.db.rpc('redeem_invite', { p_code: code });
  coupleId = data as string;
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('off is where everyone starts', () => {
  it('is off for a couple that has just formed', async () => {
    expect(await enabled()).toBe(false);
  });
});

describe('it takes both of them', () => {
  it('stays off when only one has said yes', async () => {
    await optIn(alice, true);
    expect(await enabled()).toBe(false);
  });

  it('turns on when the second one does', async () => {
    await optIn(bob, true);
    expect(await enabled()).toBe(true);
  });
});

describe('either of them can stop, alone', () => {
  it('goes off the moment one withdraws', async () => {
    /*
      The asymmetry that matters. Turning it on needs agreement; turning it off
      must not, or "consent" is really negotiation. Deliberately not the unpair
      shape, where one asks and the other confirms.
    */
    await optIn(bob, false);
    expect(await enabled()).toBe(false);
  });

  it('leaves the other one still opted in', async () => {
    // Withdrawing must not quietly revoke their answer too — they said yes, and
    // that stays true, which is what lets the screen say "waiting for them".
    const { data } = await admin()
      .from('profiles')
      .select('adult_opt_in_at')
      .eq('id', alice.id)
      .single();
    expect(data!.adult_opt_in_at).not.toBeNull();
  });

  it('comes back on without a second round of asking', async () => {
    await optIn(bob, true);
    expect(await enabled()).toBe(true);
  });
});

describe('nobody may consent on anybody else behalf', () => {
  it('refuses one partner writing the other opt-in', async () => {
    /*
      The single most important assertion here. `update own profile` is scoped to
      `id = auth.uid()`, so this is a no-op rather than an error — RLS filters the
      row out and the update matches nothing. Asserted by reading the value back:
      a policy that silently declines looks exactly like a write that worked.
    */
    await optIn(bob, false);
    expect(await enabled()).toBe(false);

    await alice.db
      .from('profiles')
      .update({ adult_opt_in_at: new Date().toISOString() })
      .eq('id', bob.id);

    const { data } = await admin()
      .from('profiles')
      .select('adult_opt_in_at')
      .eq('id', bob.id)
      .single();

    expect(data!.adult_opt_in_at, 'alice set bob opt-in').toBeNull();
    expect(await enabled(), 'alice enabled the packs on her own').toBe(false);
  });

  it('ignores a client writing the derived flag directly', async () => {
    /*
      `adult_packs_enabled` is derived, and a column that looks writable is a
      trap. Whatever a client puts there, the next time either person touches
      their own opt-in the trigger overwrites it — so the value in between would
      be a lie, and this asserts the app cannot create one that sticks.
    */
    await alice.db.from('couples').update({ adult_packs_enabled: true }).eq('id', coupleId);

    // Either the policy refused, or the trigger will correct it. Both are fine;
    // what is not fine is it staying true while bob has said no.
    await optIn(alice, true);
    expect(await enabled()).toBe(false);
  });
});
