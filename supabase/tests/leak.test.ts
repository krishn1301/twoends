import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  COUPLE_TABLES,
  SUPABASE_URL,
  adminClient,
  createUser,
  deleteUsers,
  requireKeys,
  type CoupleTable,
  type TestUser,
} from './helpers.ts';

/**
 * The cross-couple leak suite.
 *
 * "A couple app that leaks between couples is not a bug, it's the end of the
 * project." This suite is the proof that it does not, and it runs before any
 * merge.
 *
 * Three users, two couples:
 *
 *   Alice + Bob  → couple A, with a row seeded in every couple-scoped table
 *   Mallory      → couple B, alone, and the adversary
 *
 * Mallory is a perfectly ordinary signed-in user. She is not attacking the
 * database; she is simply asking for other people's rows the way any client
 * could. Every question she asks must come back empty or refused.
 *
 * Bob exists to keep the suite honest. Without his assertions, dropping the
 * entire schema would turn this file green — the most dangerous kind of passing
 * test. Every "Mallory sees nothing" claim is paired with a "Bob sees it" one.
 */

let alice: TestUser;
let bob: TestUser;
let mallory: TestUser;
let coupleA: string;
let coupleB: string;
let promptDayId: string;
let answerId: string;

const admin = () => adminClient();

beforeAll(async () => {
  requireKeys();

  alice = await createUser('alice');
  bob = await createUser('bob');
  mallory = await createUser('mallory');

  const db = admin();

  await db.from('profiles').insert([
    { id: alice.id, display_name: 'Alice', accent_key: 'teal' },
    { id: bob.id, display_name: 'Bob', accent_key: 'rose' },
    { id: mallory.id, display_name: 'Mallory', accent_key: 'iris' },
  ]);

  const couples = await db
    .from('couples')
    .insert([
      { member_a: alice.id, member_b: bob.id, started_on: '2025-04-17' },
      { member_a: mallory.id },
    ])
    .select('id, member_a');
  if (couples.error) throw new Error(`seed couples: ${couples.error.message}`);

  coupleA = couples.data.find((c) => c.member_a === alice.id)!.id;
  coupleB = couples.data.find((c) => c.member_a === mallory.id)!.id;

  const prompt = await db
    .from('prompts')
    .insert({ body: 'What did you almost tell me today?' })
    .select('id')
    .single();
  if (prompt.error) throw new Error(`seed prompt: ${prompt.error.message}`);

  const day = await db
    .from('prompt_days')
    .insert({ couple_id: coupleA, prompt_id: prompt.data.id, local_date: '2026-08-10' })
    .select('id')
    .single();
  if (day.error) throw new Error(`seed prompt_day: ${day.error.message}`);
  promptDayId = day.data.id;

  const answer = await db
    .from('answers')
    .insert({
      couple_id: coupleA,
      prompt_day_id: promptDayId,
      author_id: alice.id,
      body: 'Something private.',
    })
    .select('id')
    .single();
  if (answer.error) throw new Error(`seed answer: ${answer.error.message}`);
  answerId = answer.data.id;

  // One row in every remaining couple-scoped table, so the sweep below has
  // something real to fail to read.
  const seeds: Array<[CoupleTable, Record<string, unknown>]> = [
    ['streaks', { couple_id: coupleA, current: 11, longest: 24 }],
    ['canvases', { couple_id: coupleA, author_id: alice.id, strokes: [{ p: [[0, 0]] }] }],
    ['photos', { couple_id: coupleA, author_id: alice.id, storage_path: `${coupleA}/a.webp` }],
    ['countdowns', { couple_id: coupleA, title: 'She lands', target_at: '2026-09-21T18:40:00Z' }],
    [
      'journal_entries',
      { couple_id: coupleA, author_id: alice.id, body: 'The bench by the lake.' },
    ],
    ['list_items', { couple_id: coupleA, title: 'Watch the sequel' }],
    [
      'capsules',
      {
        couple_id: coupleA,
        author_id: alice.id,
        body: 'Open in a year.',
        deliver_at: '2027-08-10T00:00:00Z',
      },
    ],
  ];
  for (const [table, row] of seeds) {
    const { error } = await db.from(table).insert(row);
    if (error) throw new Error(`seed ${table}: ${error.message}`);
  }

  await db.from('presence').insert({ profile_id: alice.id, status_note: 'at work' });
  await db.from('invites').insert({
    code: 'ABC123',
    couple_id: coupleA,
    created_by: alice.id,
    expires_at: '2030-01-01T00:00:00Z',
  });
}, 60_000);

afterAll(async () => {
  // Deleting the users cascades to profiles, and couples cascade from there.
  await deleteUsers([alice, bob, mallory].filter(Boolean));
});

describe('a stranger reads nothing', () => {
  it.each(COUPLE_TABLES)('%s returns zero rows to Mallory', async (table) => {
    const { data, error } = await mallory.db.from(table).select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(COUPLE_TABLES)('%s returns rows to Bob, who is a member', async (table) => {
    const { data, error } = await bob.db.from(table).select('*');
    expect(error).toBeNull();
    // Without this the suite would pass against an empty database.
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });

  it('Mallory cannot read the couple row', async () => {
    const { data } = await mallory.db.from('couples').select('id');
    expect(data?.map((c) => c.id)).toEqual([coupleB]);
  });

  it("Mallory cannot read Alice's profile", async () => {
    const { data } = await mallory.db.from('profiles').select('id').eq('id', alice.id);
    expect(data).toEqual([]);
  });

  it("Bob can read Alice's profile", async () => {
    const { data } = await bob.db.from('profiles').select('display_name').eq('id', alice.id);
    expect(data).toHaveLength(1);
  });

  it("Mallory cannot read Alice's location", async () => {
    const { data } = await mallory.db.from('presence').select('*').eq('profile_id', alice.id);
    expect(data).toEqual([]);
  });

  it("Bob can read Alice's location", async () => {
    const { data } = await bob.db.from('presence').select('*').eq('profile_id', alice.id);
    expect(data).toHaveLength(1);
  });

  it("Mallory cannot read Alice's invite code", async () => {
    // Six characters is brute-forceable if the table can be listed at all.
    const { data } = await mallory.db.from('invites').select('code');
    expect(data).toEqual([]);
  });

  it('prompts are shared content and readable by everyone', async () => {
    const { data, error } = await mallory.db.from('prompts').select('id');
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('a stranger writes nothing', () => {
  it.each(COUPLE_TABLES)('%s rejects an insert from Mallory', async (table) => {
    const row: Record<string, unknown> = { couple_id: coupleA };
    // Minimum viable payload per table; the point is that RLS refuses before
    // any of it matters.
    if (table === 'answers') {
      Object.assign(row, { prompt_day_id: promptDayId, author_id: mallory.id, body: 'hi' });
    }
    if (table === 'prompt_days') Object.assign(row, { local_date: '2026-08-11' });
    if (table === 'canvases') Object.assign(row, { author_id: mallory.id, strokes: [] });
    if (table === 'photos') Object.assign(row, { author_id: mallory.id, storage_path: 'x' });
    if (table === 'countdowns') {
      Object.assign(row, { title: 'x', target_at: '2027-01-01T00:00:00Z' });
    }
    if (table === 'journal_entries') Object.assign(row, { author_id: mallory.id });
    if (table === 'list_items') Object.assign(row, { title: 'x' });
    if (table === 'capsules') {
      Object.assign(row, {
        author_id: mallory.id,
        body: 'x',
        deliver_at: '2027-01-01T00:00:00Z',
      });
    }

    const { error } = await mallory.db.from(table).insert(row);
    expect(error, `${table} accepted a write from a stranger`).not.toBeNull();
  });

  it("Mallory cannot edit Alice's answer", async () => {
    const { data } = await mallory.db
      .from('answers')
      .update({ body: 'tampered' })
      .eq('id', answerId)
      .select();
    expect(data).toEqual([]);

    const check = await admin().from('answers').select('body').eq('id', answerId).single();
    expect(check.data?.body).toBe('Something private.');
  });

  it("Mallory cannot delete Alice's answer", async () => {
    await mallory.db.from('answers').delete().eq('id', answerId);
    const check = await admin().from('answers').select('id').eq('id', answerId);
    expect(check.data).toHaveLength(1);
  });

  it('Mallory cannot add herself to another couple', async () => {
    const { data } = await mallory.db
      .from('couples')
      .update({ member_b: mallory.id })
      .eq('id', coupleA)
      .select();
    expect(data).toEqual([]);
  });
});

describe('a partner is not an editor', () => {
  it("Bob can read Alice's answer but cannot rewrite it", async () => {
    const read = await bob.db.from('answers').select('body').eq('id', answerId);
    expect(read.data).toHaveLength(1);

    const { data } = await bob.db
      .from('answers')
      .update({ body: 'edited by Bob' })
      .eq('id', answerId)
      .select();
    expect(data).toEqual([]);

    const check = await admin().from('answers').select('body').eq('id', answerId).single();
    expect(check.data?.body).toBe('Something private.');
  });

  it("Bob cannot delete Alice's journal entry", async () => {
    const before = await admin().from('journal_entries').select('id').eq('couple_id', coupleA);
    await bob.db.from('journal_entries').delete().eq('couple_id', coupleA);
    const after = await admin().from('journal_entries').select('id').eq('couple_id', coupleA);
    expect(after.data?.length).toBe(before.data?.length);
  });
});

describe('storage is scoped the same way as the tables', () => {
  const path = () => `${coupleA}/leak-probe.txt`;

  beforeAll(async () => {
    const { error } = await admin()
      .storage.from('photos')
      .upload(path(), new Blob(['private']), { upsert: true });
    if (error) throw new Error(`seed storage: ${error.message}`);
  });

  it('Bob can download the pair’s photo', async () => {
    const { data, error } = await bob.db.storage.from('photos').download(path());
    expect(error).toBeNull();
    expect(await data?.text()).toBe('private');
  });

  it('Mallory cannot download it', async () => {
    const { data, error } = await mallory.db.storage.from('photos').download(path());
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('Mallory cannot list the folder', async () => {
    const { data } = await mallory.db.storage.from('photos').list(coupleA);
    expect(data ?? []).toEqual([]);
  });

  it('Mallory cannot write into the pair’s folder', async () => {
    const { error } = await mallory.db.storage
      .from('photos')
      .upload(`${coupleA}/evil.txt`, new Blob(['x']));
    expect(error).not.toBeNull();
  });

  it('the buckets are private, so a signed URL is the only way in', async () => {
    const { data } = await admin().storage.listBuckets();
    const ours = (data ?? []).filter((b) => ['photos', 'covers', 'avatars'].includes(b.name));
    expect(ours).toHaveLength(3);
    for (const bucket of ours) {
      expect(bucket.public, `${bucket.name} is public`).toBe(false);
    }
  });
});

describe('the suite covers the whole schema', () => {
  it('fails when a table is added without being tested here', async () => {
    /*
      Asks PostgREST what it exposes rather than trusting this file's own list.
      The realistic way this project leaks is not a bad policy — it is a table
      added in six months to a schema nobody re-reads, with no policy and no
      test. This turns that into a failing build on the day it happens.
    */
    const { anon } = requireKeys();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    });
    const spec = (await res.json()) as { definitions?: Record<string, unknown> };
    const exposed = Object.keys(spec.definitions ?? {}).sort();

    const accountedFor = new Set<string>([
      ...COUPLE_TABLES,
      // Asserted individually above, each for its own reason.
      'profiles',
      'couples',
      'invites',
      'presence',
      'push_tokens',
      'prompts',
    ]);

    const uncovered = exposed.filter((t) => !accountedFor.has(t));
    expect(
      uncovered,
      `New table(s) reachable over the API with no leak-suite coverage: ${uncovered.join(', ')}. ` +
        'Add a policy in the RLS migration and assertions here before shipping.',
    ).toEqual([]);
  });

  it('push_tokens are private to their owner', async () => {
    await admin()
      .from('push_tokens')
      .insert({ profile_id: alice.id, platform: 'android', token: 'secret-token' });

    const mine = await mallory.db.from('push_tokens').select('token');
    expect(mine.data).toEqual([]);

    // Even the partner has no business with the other's device token.
    const partner = await bob.db.from('push_tokens').select('token');
    expect(partner.data).toEqual([]);
  });
});
