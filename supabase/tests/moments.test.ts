import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * Same thing, same time — asked of the database.
 *
 * The whole feature is one claim: neither photograph is visible until both
 * exist. That is not something the app can promise, because anybody holding a
 * session can ask PostgREST directly, so it is a policy and this is where it is
 * checked.
 *
 * The other half — which prompt, at what hour — is a pure function and is
 * tested in `packages/core/src/moments.test.ts`. Nothing about it reaches the
 * database, deliberately: a table of scheduled moments would be a second source
 * of truth about something already derived.
 */

const admin = () => adminClient();
const users: TestUser[] = [];

let alice: TestUser;
let bob: TestUser;
let mallory: TestUser;
let coupleId: string;

const DAY = '2026-08-20';

async function newUser(label: string): Promise<TestUser> {
  const user = await createUser(label);
  await admin().from('profiles').insert({ id: user.id, display_name: label, accent_key: 'teal' });
  users.push(user);
  return user;
}

const shotsVisibleTo = async (who: TestUser): Promise<string[]> => {
  const { data, error } = await who.db
    .from('moment_shots')
    .select('author_id')
    .eq('couple_id', coupleId)
    .eq('local_date', DAY);

  // A silent empty result reads exactly like a policy correctly hiding a row.
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.author_id as string);
};

const take = (who: TestUser, path: string) =>
  who.db.from('moment_shots').insert({
    couple_id: coupleId,
    author_id: who.id,
    local_date: DAY,
    prompt: 'The nearest window.',
    storage_path: `${coupleId}/${path}`,
  });

beforeAll(async () => {
  requireKeys();

  alice = await newUser('moment-a');
  bob = await newUser('moment-b');
  mallory = await newUser('moment-x');

  const { data: code } = await alice.db.rpc('create_invite');
  const { data } = await bob.db.rpc('redeem_invite', { p_code: code });
  coupleId = data as string;
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('before either of them has taken one', () => {
  it('shows nothing to anybody', async () => {
    expect(await shotsVisibleTo(alice)).toEqual([]);
    expect(await shotsVisibleTo(bob)).toEqual([]);
  });
});

describe('when only one of them has', () => {
  beforeAll(async () => {
    const { error } = await take(alice, 'alice.webp');
    expect(error, 'Alice could not take her own').toBeNull();
  });

  it('shows Alice her own', async () => {
    expect(await shotsVisibleTo(alice)).toEqual([alice.id]);
  });

  /*
    The claim the feature is made of. Bob is a member of this couple and can
    read every other couple-scoped table they own; this one row stays dark until
    he has taken his own, because seeing hers first would change what he takes.
  */
  it('shows Bob nothing at all', async () => {
    expect(await shotsVisibleTo(bob)).toEqual([]);
  });

  it('will not let Bob write a row in her name to open it', async () => {
    const { error } = await bob.db.from('moment_shots').insert({
      couple_id: coupleId,
      author_id: alice.id,
      local_date: DAY,
      prompt: 'The nearest window.',
      storage_path: `${coupleId}/forged.webp`,
    });
    expect(error, 'Bob wrote a shot as Alice').not.toBeNull();
  });
});

describe('once both have', () => {
  beforeAll(async () => {
    const { error } = await take(bob, 'bob.webp');
    expect(error, 'Bob could not take his own').toBeNull();
  });

  it('opens for both of them at once', async () => {
    expect((await shotsVisibleTo(alice)).sort()).toEqual([alice.id, bob.id].sort());
    expect((await shotsVisibleTo(bob)).sort()).toEqual([alice.id, bob.id].sort());
  });

  it('is still one each — a second is refused rather than stacked', async () => {
    const { error } = await take(alice, 'alice-again.webp');
    expect(error, 'Alice took two on the same day').not.toBeNull();
  });

  /*
    Either of them may keep it, which is the rule photographs have had since the
    beginning: the one who took it does not own the memory of it.
  */
  it('lets either of them keep it', async () => {
    const { error } = await bob.db
      .from('moment_shots')
      .update({ kept: true })
      .eq('couple_id', coupleId)
      .eq('author_id', alice.id);
    expect(error).toBeNull();

    const { data } = await admin()
      .from('moment_shots')
      .select('kept')
      .eq('couple_id', coupleId)
      .eq('author_id', alice.id)
      .single();
    expect(data?.kept).toBe(true);
  });
});

describe('a stranger', () => {
  it('sees nothing, whatever the two of them have done', async () => {
    const { data, error } = await mallory.db
      .from('moment_shots')
      .select('id')
      .eq('couple_id', coupleId);

    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });

  it('cannot take one in their day', async () => {
    const { error } = await mallory.db.from('moment_shots').insert({
      couple_id: coupleId,
      author_id: mallory.id,
      local_date: DAY,
      prompt: 'Your shoes.',
      storage_path: `${coupleId}/mallory.webp`,
    });
    expect(error, 'a stranger took a moment in somebody else’s couple').not.toBeNull();
  });
});
