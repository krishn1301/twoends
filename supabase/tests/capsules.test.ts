import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * The seal.
 *
 * A time capsule whose contents reach the device early is not a capsule — it is
 * a countdown with the answer printed underneath, and anyone who opens dev tools
 * can read ahead. Knowing you *could* is enough to spoil it.
 *
 * So the rule lives in Postgres, and these tests ask the database directly, as
 * the app's own client would.
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

beforeAll(async () => {
  requireKeys();

  alice = await newUser('capsule-a');
  bob = await newUser('capsule-b');

  const { data: code } = await alice.db.rpc('create_invite');
  const { data } = await bob.db.rpc('redeem_invite', { p_code: code });
  coupleId = data as string;

  await admin().from('capsules').insert([
    {
      couple_id: coupleId,
      author_id: alice.id,
      title: 'For your birthday',
      body: 'Something she should not read yet.',
      deliver_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    },
    {
      couple_id: coupleId,
      author_id: alice.id,
      title: 'Already open',
      body: 'This one has arrived.',
      deliver_at: new Date(Date.now() - 86_400_000).toISOString(),
    },
  ]);
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('a sealed capsule', () => {
  it('is invisible to the partner it was written for', async () => {
    const { data } = await bob.db.from('capsules').select('body');
    expect(data?.map((c) => c.body)).toEqual(['This one has arrived.']);
  });

  it('is invisible to the person who wrote it', async () => {
    /*
      The important one. A capsule the author can reread on a bad Tuesday is
      just a note, and every other app that has tried this lets the writer peek.
    */
    const { data } = await alice.db.from('capsules').select('body');
    expect(data?.map((c) => c.body)).toEqual(['This one has arrived.']);
  });

  it('does not leak through a count', async () => {
    const { count } = await bob.db.from('capsules').select('id', { count: 'exact', head: true });
    expect(count).toBe(1);
  });

  it('still tells them something is coming, and when', async () => {
    // The waiting is most of the pleasure — the app has to be able to say "one
    // opens in November" without leaking a word of it.
    const { data, error } = await bob.db.rpc('sealed_capsules');
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.title).toBe('For your birthday');
    expect(JSON.stringify(data)).not.toContain('should not read');
  });

  it('opens by itself when its day arrives', async () => {
    // No job, no sweep, no delivery step: the policy compares to now(), so the
    // capsule becomes readable the moment the clock passes it.
    await admin()
      .from('capsules')
      .update({ deliver_at: new Date(Date.now() - 1000).toISOString() })
      .eq('title', 'For your birthday');

    const { data } = await bob.db.from('capsules').select('body').eq('title', 'For your birthday');
    expect(data?.[0]?.body).toContain('should not read yet');
  });
});

describe('a stranger sees no capsules at all', () => {
  it('reads nothing, sealed or open', async () => {
    const mallory = await newUser('capsule-m');

    const { data } = await mallory.db.from('capsules').select('*');
    expect(data).toEqual([]);

    const { data: sealed } = await mallory.db.rpc('sealed_capsules');
    expect(sealed ?? []).toEqual([]);
  });
});

describe('questions one of you wrote', () => {
  it('belongs to the couple and nobody else', async () => {
    const { data: ask, error } = await alice.db
      .from('prompts')
      .insert({
        body: 'What did you think of me when we met?',
        pack: 'ours',
        couple_id: coupleId,
        author_id: alice.id,
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    // The partner sees it, because it is for them.
    const partnerView = await bob.db.from('prompts').select('body').eq('id', ask!.id);
    expect(partnerView.data).toHaveLength(1);

    // Nobody else does, even though every shared prompt is world-readable.
    const mallory = await newUser('ask-m');
    const stranger = await mallory.db.from('prompts').select('body').eq('id', ask!.id);
    expect(stranger.data).toEqual([]);
  });

  it('still lets everyone read the packs that ship with the app', async () => {
    const outsider = await newUser('ask-o');
    const { data } = await outsider.db.from('prompts').select('id').is('couple_id', null).limit(5);
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  it('cannot be written into someone else’s couple', async () => {
    const mallory = await newUser('ask-x');
    const { error } = await mallory.db.from('prompts').insert({
      body: 'Let me into your day.',
      pack: 'ours',
      couple_id: coupleId,
      author_id: mallory.id,
    });
    expect(error).not.toBeNull();
  });
});
