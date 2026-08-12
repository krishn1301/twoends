import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * The reveal.
 *
 * "Answers appear only after both have replied" is the core mechanic of this
 * app, and the whole question is whether it is a *rule* or a *curtain*. A client
 * that receives both answers and chooses to render one of them has not
 * implemented a mechanic; it has implemented a delay that anyone can skip with
 * dev tools open.
 *
 * These tests ask the database directly, as the partner's own signed-in client
 * would, and assert that nothing comes back.
 */

const admin = () => adminClient();
const users: TestUser[] = [];

let alice: TestUser;
let bob: TestUser;
let coupleId: string;
let promptId: string;
let promptDayId: string;

async function newUser(label: string): Promise<TestUser> {
  const u = await createUser(label);
  await admin().from('profiles').insert({ id: u.id, display_name: label, accent_key: 'teal' });
  users.push(u);
  return u;
}

beforeAll(async () => {
  requireKeys();

  alice = await newUser('reveal-a');
  bob = await newUser('reveal-b');

  const { data: code } = await alice.db.rpc('create_invite');
  const { data } = await bob.db.rpc('redeem_invite', { p_code: code });
  coupleId = data as string;

  const prompt = await admin().from('prompts').select('id').limit(1).single();
  promptId = prompt.data!.id;

  const day = await admin()
    .from('prompt_days')
    .insert({ couple_id: coupleId, prompt_id: promptId, local_date: '2026-08-12' })
    .select('id')
    .single();
  promptDayId = day.data!.id;
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('before you have answered', () => {
  it('their answer is invisible — not hidden, absent', async () => {
    await alice.db.from('answers').insert({
      couple_id: coupleId,
      prompt_day_id: promptDayId,
      author_id: alice.id,
      body: 'Something I only want them to read after they have written theirs.',
    });

    // Bob has not answered. He is a member of the couple, so the ordinary
    // "members read" policy would hand him the row; the restrictive reveal
    // policy is what stops it.
    const { data, error } = await bob.db.from('answers').select('*');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('leaks nothing through a count either', async () => {
    // A count would betray the length of the conversation even with the text
    // withheld, and "they answered a long one" is information.
    const { count } = await bob.db
      .from('answers')
      .select('id', { count: 'exact', head: true })
      .eq('prompt_day_id', promptDayId);
    expect(count ?? 0).toBe(0);
  });

  it('still lets him learn *that* they answered', async () => {
    // Otherwise the screen cannot say "your move" and just looks empty. A
    // boolean crosses; no row does.
    const { data, error } = await bob.db.rpc('partner_has_answered', {
      p_prompt_day_id: promptDayId,
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('lets the author read their own answer back', async () => {
    const { data } = await alice.db.from('answers').select('body');
    expect(data).toHaveLength(1);
  });
});

describe('once both have answered', () => {
  it('opens for both at once', async () => {
    await bob.db.from('answers').insert({
      couple_id: coupleId,
      prompt_day_id: promptDayId,
      author_id: bob.id,
      body: 'Mine.',
    });

    for (const [who, self] of [
      ['alice', alice],
      ['bob', bob],
    ] as const) {
      const { data } = await self.db.from('answers').select('author_id, body');
      expect(data, `${who} could not see both answers`).toHaveLength(2);
    }
  });

  it('does not let either rewrite the other’s words', async () => {
    const { data } = await bob.db
      .from('answers')
      .update({ body: 'edited by Bob' })
      .eq('author_id', alice.id)
      .select();
    expect(data).toEqual([]);

    const check = await admin().from('answers').select('body').eq('author_id', alice.id).single();
    expect(check.data?.body).toContain('Something I only want them');
  });
});

describe('a stranger sees none of it', () => {
  it('reads zero answers regardless of who has replied', async () => {
    const mallory = await newUser('reveal-m');
    const { data } = await mallory.db.from('answers').select('*');
    expect(data).toEqual([]);

    // And the boolean helper must not become a side channel into other couples.
    const { data: leaked } = await mallory.db.rpc('partner_has_answered', {
      p_prompt_day_id: promptDayId,
    });
    expect(leaked).toBe(false);
  });
});
