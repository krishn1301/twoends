import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminClient, createUser, deleteUsers, requireKeys, type TestUser } from './helpers.ts';

/**
 * "Do you know me?", asked of the database.
 *
 * The whole game is one property: you cannot see what they chose until you have
 * committed a guess. Everything the screen does about that is convenience — a
 * client that receives the answer and declines to render it has implemented a
 * delay, not a mechanic, and anybody with dev tools can skip a delay.
 *
 * There are two ways to break it that the original game could not have. A card
 * written about one person carries their answer, so it must be hidden the same
 * way an answer is. And a guess row could be written in halves: send the choice,
 * read the row the reveal now hands you, come back and fill in a guess you can
 * no longer get wrong. Both are tested here.
 */

const admin = () => adminClient();
const users: TestUser[] = [];

let alice: TestUser;
let bob: TestUser;
let coupleId: string;

/** Shaped like the ids the app derives from a card's own words. */
const CARD = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DECK = 'ffffffff-1111-4222-8333-444444444444';

async function newUser(label: string): Promise<TestUser> {
  const u = await createUser(label);
  await admin().from('profiles').insert({ id: u.id, display_name: label, accent_key: 'teal' });
  users.push(u);
  return u;
}

beforeAll(async () => {
  requireKeys();

  alice = await newUser('guess-a');
  bob = await newUser('guess-b');

  const { data: code } = await alice.db.rpc('create_invite');
  const { data } = await bob.db.rpc('redeem_invite', { p_code: code });
  coupleId = data as string;

  // Alice writes a card about herself, and answers it. The answer is an
  // ordinary pick — there is no answer column on the card.
  await alice.db.from('couple_cards').insert({
    id: CARD,
    couple_id: coupleId,
    author_id: alice.id,
    body: 'What do I want when I say nothing is wrong?',
    option_a: 'To be left alone',
    option_b: 'To be asked again',
  });
  await alice.db
    .from('game_picks')
    .insert({ couple_id: coupleId, card_id: CARD, profile_id: alice.id, choice: 1, mode: 'match' });
}, 60_000);

afterAll(async () => {
  await deleteUsers(users);
});

describe('a card she wrote about herself', () => {
  it('is readable by him — the question is not the secret', async () => {
    const { data } = await bob.db.from('couple_cards').select('id, body').eq('id', CARD);
    expect(data).toHaveLength(1);
  });

  it('carries no answer anywhere on it', async () => {
    /*
      The design, not an omission. Row-level security cannot hide a column, so a
      `truth` column here would be readable by him the moment it was written and
      the game would be over before it began.
    */
    const { data } = await bob.db.from('couple_cards').select('*').eq('id', CARD).single();
    const columns = Object.keys(data as object);
    for (const name of ['truth', 'answer', 'correct', 'choice']) {
      expect(columns, `couple_cards.${name} would give the game away`).not.toContain(name);
    }
  });

  it('hides her answer until he has guessed', async () => {
    // Not filtered — absent. The row does not come back at all.
    const { data } = await bob.db
      .from('game_picks')
      .select('profile_id, choice')
      .eq('card_id', CARD);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('guessing opens it', () => {
  it('shows her answer once his guess exists', async () => {
    const written = await bob.db
      .from('game_picks')
      .insert({ couple_id: coupleId, card_id: CARD, profile_id: bob.id, guess: 1, mode: 'guess' });
    expect(written.error).toBeNull();

    const { data } = await bob.db
      .from('game_picks')
      .select('profile_id, choice, guess')
      .eq('card_id', CARD);

    const hers = (data ?? []).find((r) => r.profile_id === alice.id);
    expect(hers?.choice).toBe(1);
  });

  it('and she still cannot see his guess until she has one of her own', async () => {
    // Symmetry, on a card neither has touched. Hers is the row that does not
    // exist yet, so his must be invisible to her for exactly the same reason.
    await bob.db
      .from('game_picks')
      .insert({ couple_id: coupleId, card_id: DECK, profile_id: bob.id, choice: 0, guess: 1, mode: 'guess' });

    const { data } = await alice.db.from('game_picks').select('profile_id').eq('card_id', DECK);
    expect(data ?? []).toHaveLength(0);
  });
});

describe('a guess cannot be written in halves', () => {
  it('refuses a guess-mode row with no guess in it', async () => {
    /*
      The attack the constraint exists for: write the choice half, read the row
      the reveal now hands you, then come back and fill in a guess you cannot
      get wrong. The reveal opens on "you have a row", so the fix is that a row
      of this kind cannot exist without the guess already in it.
    */
    const half = await alice.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: DECK,
      profile_id: alice.id,
      choice: 0,
      mode: 'guess',
    });

    expect(half.error, 'a half-written guess row was accepted').not.toBeNull();

    const { data } = await alice.db.from('game_picks').select('profile_id').eq('card_id', DECK);
    expect(data ?? [], 'the failed write opened the reveal anyway').toHaveLength(0);
  });

  it('refuses a row that says nothing at all', async () => {
    const empty = await alice.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: DECK,
      profile_id: alice.id,
      mode: 'match',
    });
    expect(empty.error).not.toBeNull();
  });
});

describe('cards belong to whoever wrote them', () => {
  it('refuses him writing one in her name', async () => {
    const forged = await bob.db.from('couple_cards').insert({
      id: 'cccccccc-dddd-4eee-8fff-000000000000',
      couple_id: coupleId,
      author_id: alice.id,
      option_a: 'one',
      option_b: 'other',
    });
    expect(forged.error).not.toBeNull();
  });

  it('refuses him deleting hers', async () => {
    await bob.db.from('couple_cards').delete().eq('id', CARD);
    const { data } = await admin().from('couple_cards').select('id').eq('id', CARD);
    expect(data ?? [], 'bob deleted a card alice wrote').toHaveLength(1);
  });

  it('has no update policy, so words cannot change under an answer', async () => {
    // Editing a card after somebody guessed would silently change what they
    // were asked while their guess sat there looking like an answer to it.
    await alice.db.from('couple_cards').update({ option_a: 'something else' }).eq('id', CARD);
    const { data } = await admin().from('couple_cards').select('option_a').eq('id', CARD).single();
    expect(data!.option_a).toBe('To be left alone');
  });
});

describe('the tally', () => {
  it('counts a right guess for the person who made it', async () => {
    const { data } = await bob.db.rpc('guess_tally', { p_couple_id: coupleId });
    const rows = (data ?? []) as { profile_id: string; asked: number; got_right: number }[];
    const his = rows.find((r) => r.profile_id === bob.id);

    // He guessed 1 on her card and she chose 1.
    expect(his?.asked).toBeGreaterThanOrEqual(1);
    expect(his?.got_right).toBeGreaterThanOrEqual(1);
  });

  it('leaves out cards the other person has not answered', async () => {
    /*
      Waiting is not wrong. He has guessed on the deck card and she has not
      chosen, so it must not count against him — a tally that conflated the two
      would tell somebody they had failed a question nobody has answered.
    */
    const { data } = await bob.db.rpc('guess_tally', { p_couple_id: coupleId });
    const rows = (data ?? []) as { profile_id: string; asked: number; got_right: number }[];
    expect(rows.find((r) => r.profile_id === bob.id)?.asked).toBe(1);
  });
});
