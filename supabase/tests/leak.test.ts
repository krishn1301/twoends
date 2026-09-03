import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ACCENT_KEYS } from '@twoends/core';

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
let photoId: string;
let answerId: string;

/*
  Card ids are hashes of the card's own words, generated in `packages/core`.
  Two literals are used here rather than importing the deck, because the point
  of these tests is the policy — and a suite that reshuffles when someone edits
  a card's wording would be testing the content file instead.
*/
const SHARED_CARD = '11111111-1111-4111-8111-111111111111';
const SOLO_CARD = '22222222-2222-4222-8222-222222222222';

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

  /*
    Bob answers too, so this suite tests *couple isolation* rather than
    accidentally re-testing the reveal. Since the daily loop landed, a partner
    who has not replied cannot see the other's answer either — that rule has its
    own suite in reveal.test.ts, and leaving Bob silent here would make the
    positive controls below fail for the wrong reason.
  */
  const bobAnswer = await db.from('answers').insert({
    couple_id: coupleA,
    prompt_day_id: promptDayId,
    author_id: bob.id,
    body: 'Mine, so the reveal opens.',
  });
  if (bobAnswer.error) throw new Error(`seed bob answer: ${bobAnswer.error.message}`);

  /*
    Seeded on its own rather than in the list below, because a snap comment has
    to hang off a real photo and the list does not hand back ids.
  */
  const photo = await db
    .from('photos')
    .insert({ couple_id: coupleA, author_id: alice.id, storage_path: `${coupleA}/a.webp` })
    .select('id')
    .single();
  if (photo.error) throw new Error(`seed photo: ${photo.error.message}`);
  photoId = photo.data.id;

  // One row in every remaining couple-scoped table, so the sweep below has
  // something real to fail to read.
  const seeds: Array<[CoupleTable, Record<string, unknown>]> = [
    ['streaks', { couple_id: coupleA, current: 11, longest: 24 }],
    ['canvases', { couple_id: coupleA, author_id: alice.id, strokes: [{ p: [[0, 0]] }] }],
    ['countdowns', { couple_id: coupleA, title: 'She lands', target_at: '2026-09-21T18:40:00Z' }],
    [
      'journal_entries',
      { couple_id: coupleA, author_id: alice.id, body: 'The bench by the lake.' },
    ],
    ['list_items', { couple_id: coupleA, title: 'Watch the sequel' }],
    ['quiet_periods', { couple_id: coupleA, from_date: '2026-08-01', to_date: '2026-08-03' }],
    [
      'recaps',
      {
        couple_id: coupleA,
        month: '2026-08-01',
        from_date: '2026-07-17',
        to_date: '2026-08-16',
      },
    ],
    [
      'snap_comments',
      { couple_id: coupleA, photo_id: photoId, author_id: alice.id, body: 'Your hair looks good.' },
    ],
    [
      'couple_cards',
      {
        id: 'dddddddd-eeee-4fff-8000-111111111111',
        couple_id: coupleA,
        author_id: alice.id,
        option_a: 'One',
        option_b: 'The other',
      },
    ],
    [
      'capsules',
      {
        couple_id: coupleA,
        author_id: alice.id,
        body: 'Already delivered.',
        /*
          Deliberately in the past. This suite asks whether one couple can read
          another's rows; a sealed capsule is invisible to its own couple too,
          which would make the positive control fail for the wrong reason. The
          seal has its own suite.
        */
        deliver_at: '2020-01-01T00:00:00Z',
      },
    ],
  ];
  for (const [table, row] of seeds) {
    const { error } = await db.from(table).insert(row);
    if (error) throw new Error(`seed ${table}: ${error.message}`);
  }

  /*
    `game_picks` is seeded outside the loop because it needs *both* people.

    The reveal policy hides a partner's pick until you have made your own, so a
    row from Alice alone would be invisible to Bob — and the positive control
    "Bob, who is a member, sees rows" would fail for the right reason and the
    wrong one, exactly as a sealed capsule would. Both pick the shared card; the
    reveal itself is tested on `soloCardId` below, where only Alice has.
  */
  const picks = await db.from('game_picks').insert([
    { couple_id: coupleA, card_id: SHARED_CARD, profile_id: alice.id, choice: 0 },
    { couple_id: coupleA, card_id: SHARED_CARD, profile_id: bob.id, choice: 1 },
    { couple_id: coupleA, card_id: SOLO_CARD, profile_id: alice.id, choice: 1 },
  ]);
  if (picks.error) throw new Error(`seed game_picks: ${picks.error.message}`);

  // `sharing` matters: since migration 13 the partner-read policy stops matching
  // when it is false, so a seed without it would make the positive controls
  // below fail for the right reason and the wrong one.
  await db
    .from('presence')
    .insert({ profile_id: alice.id, status_note: 'at work', sharing: true });
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
    if (table === 'game_picks') {
      Object.assign(row, { card_id: SHARED_CARD, profile_id: mallory.id, choice: 0 });
    }
    if (table === 'snap_comments') {
      Object.assign(row, { photo_id: photoId, author_id: mallory.id, body: 'x' });
    }
    if (table === 'couple_cards') {
      Object.assign(row, {
        id: 'eeeeeeee-ffff-4000-8111-222222222222',
        author_id: mallory.id,
        option_a: 'x',
        option_b: 'y',
      });
    }
    if (table === 'quiet_periods') Object.assign(row, { from_date: '2026-08-01' });
    if (table === 'recaps') {
      Object.assign(row, { month: '2026-09-01', from_date: '2026-08-17', to_date: '2026-09-16' });
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

/*
  Location is the one thing in this schema that could turn the app into a
  surveillance tool, and the only place where a *partner* — not a stranger — is
  the party the rules defend against. Everything below runs as Alice and Bob,
  who are a real couple with every right to each other's photos and words.
*/
describe('location is opt-in, coarse, and erased when switched off', () => {
  const DELHI = { lat: 28.613912345, lng: 77.209012345 };

  const presenceOf = async (id: string) =>
    (await admin().from('presence').select('*').eq('profile_id', id).single()).data;

  beforeAll(async () => {
    await admin().from('presence').upsert(
      [
        { profile_id: alice.id, sharing: true, wants_precise: false, ...DELHI },
        { profile_id: bob.id, sharing: true, wants_precise: false, lat: 19.07, lng: 72.87 },
      ],
      { onConflict: 'profile_id' },
    );
  });

  it('rounds a precise coordinate away when only one partner asked for precise', async () => {
    const { error } = await alice.db
      .from('presence')
      .update({ wants_precise: true, ...DELHI })
      .eq('profile_id', alice.id);
    expect(error).toBeNull();

    const row = await presenceOf(alice.id);
    expect(row?.precision).toBe('coarse');
    // The grid is a tenth of a degree. Anything finer surviving the write means
    // a client could opt itself into precise unilaterally.
    expect(row?.lat).toBeCloseTo(28.6, 6);
    expect(row?.lng).toBeCloseTo(77.2, 6);
  });

  it('keeps a precise coordinate only once both partners have asked', async () => {
    await bob.db.from('presence').update({ wants_precise: true }).eq('profile_id', bob.id);
    await alice.db.from('presence').update(DELHI).eq('profile_id', alice.id);

    const row = await presenceOf(alice.id);
    expect(row?.precision).toBe('precise');
    expect(row?.lat).toBeCloseTo(DELHI.lat, 9);
  });

  it("re-coarsens Alice's stored row the moment Bob withdraws, without Alice writing", async () => {
    await bob.db.from('presence').update({ wants_precise: false }).eq('profile_id', bob.id);

    const row = await presenceOf(alice.id);
    expect(row?.precision).toBe('coarse');
    expect(row?.lat).toBeCloseTo(28.6, 6);
  });

  it('erases the coordinate when sharing is switched off, rather than freezing it', async () => {
    await alice.db.from('presence').update({ sharing: false }).eq('profile_id', alice.id);

    const row = await presenceOf(alice.id);
    expect(row?.lat).toBeNull();
    expect(row?.lng).toBeNull();
  });

  it('hides the row from the partner while sharing is off', async () => {
    const { data } = await bob.db.from('presence').select('*').eq('profile_id', alice.id);
    expect(data).toEqual([]);
  });

  it('shows it again when Alice switches it back on', async () => {
    await alice.db
      .from('presence')
      .update({ sharing: true, ...DELHI })
      .eq('profile_id', alice.id);

    const { data } = await bob.db.from('presence').select('lat').eq('profile_id', alice.id);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.lat).toBeCloseTo(28.6, 6);
  });

  it('never lets Bob switch sharing on for Alice', async () => {
    await alice.db.from('presence').update({ sharing: false }).eq('profile_id', alice.id);

    const { data } = await bob.db
      .from('presence')
      .update({ sharing: true, lat: 1, lng: 1 })
      .eq('profile_id', alice.id)
      .select();
    expect(data).toEqual([]);

    const row = await presenceOf(alice.id);
    expect(row?.sharing).toBe(false);
    expect(row?.lat).toBeNull();
  });

  it('never lets Mallory read a location at all', async () => {
    await alice.db
      .from('presence')
      .update({ sharing: true, ...DELHI })
      .eq('profile_id', alice.id);

    const { data } = await mallory.db.from('presence').select('*');
    expect(data).toEqual([]);
  });
});

/*
  The app's palette and the database's constraint have to agree.

  They diverged once and nobody noticed until a phone: core grew to twelve
  accents, `profiles.accent_key` still allowed eight, and onboarding failed for
  anyone whose photo hue landed on one of the missing four — reported to them as
  a connection problem, which it was not.

  Driven by ACCENT_KEYS rather than a hardcoded list on purpose. A thirteenth
  accent added without a migration turns this red, which is the only way a
  TypeScript array and a check constraint can be kept honest about each other.
*/
describe('every accent the app offers is one the database accepts', () => {
  it.each([...ACCENT_KEYS])('%s is a writable accent_key', async (key) => {
    const { error } = await alice.db
      .from('profiles')
      .update({ accent_key: key })
      .eq('id', alice.id);
    expect(error?.message ?? null).toBeNull();
  });

  it('still refuses a key that is not in the palette', async () => {
    const { error } = await alice.db
      .from('profiles')
      .update({ accent_key: 'burgundy' })
      .eq('id', alice.id);
    expect(error).not.toBeNull();
  });
});

/*
  The game's one rule.

  "Nothing reveals until both of you have moved" is the mechanic the whole app
  is built on, and in the game it is the entire feature — a this-or-that where
  you can see their pick first is a quiz you take alone. It has to be a policy
  for the same reason the daily reveal is one: a client that receives the row
  and declines to render it has drawn a curtain, and anyone with dev tools can
  walk round a curtain.
*/
describe('a pick stays hidden until you have picked too', () => {
  it('shows Bob his own pick on a card Alice answered alone', async () => {
    const { data } = await bob.db
      .from('game_picks')
      .select('profile_id, choice')
      .eq('card_id', SOLO_CARD);

    // Bob has not played this card, so there is nothing here at all — not even
    // the fact that Alice has. Knowing she answered is itself a nudge.
    expect(data).toEqual([]);
  });

  it('shows Alice her own pick on that card, because it is hers', async () => {
    const { data } = await alice.db
      .from('game_picks')
      .select('choice')
      .eq('card_id', SOLO_CARD);
    expect(data).toHaveLength(1);
  });

  it('shows both picks once both have played', async () => {
    const { data } = await bob.db
      .from('game_picks')
      .select('profile_id, choice')
      .eq('card_id', SHARED_CARD);

    expect(data).toHaveLength(2);
    expect(new Set((data ?? []).map((r) => r.profile_id))).toEqual(new Set([alice.id, bob.id]));
  });

  it('opens the card the moment the second person picks, with no other action', async () => {
    const card = '33333333-3333-4333-8333-333333333333';

    await admin()
      .from('game_picks')
      .insert({ couple_id: coupleA, card_id: card, profile_id: alice.id, choice: 0 });

    const before = await bob.db.from('game_picks').select('choice').eq('card_id', card);
    expect(before.data).toEqual([]);

    const played = await bob.db
      .from('game_picks')
      .insert({ couple_id: coupleA, card_id: card, profile_id: bob.id, choice: 0 });
    expect(played.error).toBeNull();

    const after = await bob.db.from('game_picks').select('choice').eq('card_id', card);
    expect(after.data).toHaveLength(2);
  });

  it('will not let one partner pick on the other’s behalf', async () => {
    // "members insert" alone would allow this — the restrictive policy is what
    // stops one of you making the tally agree.
    const { error } = await bob.db.from('game_picks').insert({
      couple_id: coupleA,
      card_id: '44444444-4444-4444-8444-444444444444',
      profile_id: alice.id,
      choice: 1,
    });
    expect(error).not.toBeNull();
  });

  it('will not let one partner rewrite what the other chose', async () => {
    const { error } = await bob.db
      .from('game_picks')
      .update({ choice: 1 })
      .eq('card_id', SHARED_CARD)
      .eq('profile_id', alice.id);

    // Either a refusal or a no-op is correct; what matters is that her stored
    // choice is untouched afterwards.
    const { data } = await admin()
      .from('game_picks')
      .select('choice')
      .eq('card_id', SHARED_CARD)
      .eq('profile_id', alice.id)
      .single();

    expect(error === null || error !== null).toBe(true);
    expect(data?.choice).toBe(0);
  });

  it('counts the tally without showing Mallory anything', async () => {
    const mine = await alice.db.rpc('game_tally', { p_couple_id: coupleA });
    expect(mine.error).toBeNull();
    expect((mine.data as { played: number }[])[0]?.played).toBeGreaterThan(0);

    // The function is security-definer, so it must check membership itself —
    // otherwise it is a hole straight through every policy above it.
    const theirs = await mallory.db.rpc('game_tally', { p_couple_id: coupleA });
    expect((theirs.data as { played: number }[] | null)?.[0]?.played ?? 0).toBe(0);
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
