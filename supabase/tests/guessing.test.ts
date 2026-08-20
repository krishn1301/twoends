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

/** How many guesses the tally currently credits to one person. */
async function asked(who: TestUser): Promise<number> {
  const { data } = await who.db.rpc('guess_tally', { p_couple_id: coupleId });
  const rows = (data ?? []) as { profile_id: string; asked: number }[];
  return rows.find((r) => r.profile_id === who.id)?.asked ?? 0;
}
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

  /*
    Alice writes a card about herself and answers it. Her answer is an ordinary
    row rather than a column on the card — and it is a `guess`-mode row, because
    answering a card you wrote *is* your move in the guessing game even though
    you never guess at anything. See migration 23.
  */
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
    .insert({ couple_id: coupleId, card_id: CARD, profile_id: alice.id, choice: 1, mode: 'guess' });
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
  it('opens nothing for a guess-mode row with no guess in it', async () => {
    /*
      The attack: write the choice half, read the row the reveal hands you, then
      come back and fill in a guess you can no longer get wrong.

      It used to be blocked by a constraint refusing the row. That constraint had
      to go in migration 23, because a card you *wrote* legitimately has a choice
      and no guess in it. So the door is held from the other side now — the row
      may exist, and it opens nothing until the guess is in it, which is where
      the rule always belonged.
    */
    const half = await alice.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: DECK,
      profile_id: alice.id,
      choice: 0,
      mode: 'guess',
    });
    expect(half.error).toBeNull();

    const { data } = await alice.db
      .from('game_picks')
      .select('profile_id')
      .eq('card_id', DECK)
      .neq('profile_id', alice.id);
    expect(data ?? [], 'a half-written row opened the reveal').toHaveLength(0);

    // And filling it in does open it, so the guard is a gate and not a wall.
    await alice.db
      .from('game_picks')
      .update({ guess: 1 })
      .eq('card_id', DECK)
      .eq('profile_id', alice.id);

    const { data: after } = await alice.db
      .from('game_picks')
      .select('profile_id')
      .eq('card_id', DECK)
      .neq('profile_id', alice.id);
    expect(after ?? []).toHaveLength(1);
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
      Waiting is not wrong. A guess on a card they have not answered must not
      count against the person who made it — a tally that conflated the two
      would tell somebody they had failed a question nobody has answered.

      Measured as a delta rather than an absolute, because the tally is
      cumulative across this file and an absolute number is really an assertion
      about every test above it.
    */
    const before = await asked(bob);

    const alone = '99999999-8888-4777-8666-555555555555';
    await bob.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: alone,
      profile_id: bob.id,
      choice: 0,
      guess: 1,
      mode: 'guess',
    });

    expect(await asked(bob), 'a guess nobody has answered was counted').toBe(before);
  });
});

describe('the two games no longer eat each other', () => {
  /*
    game_picks was unique on (couple, card, profile) with no notion of which
    game, so a card played in This or that was spent for Know me? and the
    reverse — the two modes sharing one deck between them. A card played in two
    games is two events, and migration 22 made it two rows.
  */
  const SHARED = '11111111-2222-4333-8444-555555555555';

  it('lets one card hold a pick and a guess from the same person', async () => {
    const asMatch = await bob.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: SHARED,
      profile_id: bob.id,
      choice: 0,
      mode: 'match',
    });
    expect(asMatch.error, 'the this-or-that pick was refused').toBeNull();

    const asGuess = await bob.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: SHARED,
      profile_id: bob.id,
      choice: 0,
      guess: 1,
      mode: 'guess',
    });
    expect(asGuess.error, 'the guess was refused because a pick existed').toBeNull();

    const { data } = await admin()
      .from('game_picks')
      .select('mode')
      .eq('card_id', SHARED)
      .eq('profile_id', bob.id);
    expect(data).toHaveLength(2);
  });

  it('still refuses two rows for the same person in the same game', async () => {
    const twice = await bob.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: SHARED,
      profile_id: bob.id,
      choice: 1,
      mode: 'match',
    });
    expect(twice.error).not.toBeNull();
  });

  it('reveals per game, not per card', async () => {
    /*
      The subtle one. `i_have_picked` used to ask "is there a row from me on
      this card" — so having picked it in This or that would have opened the
      reveal on their *guess*, which is a different question they have not
      answered yet.
    */
    const stranger = await newUser('guess-d');
    const { data: code } = await stranger.db.rpc('create_invite');
    expect(code).toBeTruthy();

    // Alice picks the shared card in match mode only.
    await alice.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: SHARED,
      profile_id: alice.id,
      choice: 1,
      mode: 'match',
    });

    // She should see bob's match row (she has picked there) and not his guess
    // row (she has not guessed).
    const { data } = await alice.db
      .from('game_picks')
      .select('mode, profile_id')
      .eq('card_id', SHARED)
      .eq('profile_id', bob.id);

    expect(data?.map((r) => r.mode)).toEqual(['match']);
  });

  it('does not let a guess arrive in the agreement tally', async () => {
    // game_tally counted every row on a card, so a guess would have shown up as
    // somebody agreeing on a question they were never asked.
    const { data } = await alice.db.rpc('game_tally', { p_couple_id: coupleId });
    const row = (data ?? [])[0] as { played: number; agreed: number };

    // Only the shared card has a pick from both of them in match mode.
    expect(row.played).toBe(1);
    expect(row.agreed).toBe(0);
  });

  it('counts a guess once, not once per row of theirs', async () => {
    /*
      Now that one card can hold two of bob's rows, a naive join would score
      alice's single guess against both of them and count it twice. The tally
      takes exactly one answer of theirs per card.
    */
    const fresh = '77777777-6666-4555-8444-333333333333';

    await bob.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: fresh,
      profile_id: bob.id,
      choice: 1,
      mode: 'match',
    });
    await bob.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: fresh,
      profile_id: bob.id,
      choice: 1,
      guess: 0,
      mode: 'guess',
    });

    const before = await asked(alice);

    await alice.db.from('game_picks').insert({
      couple_id: coupleId,
      card_id: fresh,
      profile_id: alice.id,
      guess: 1,
      mode: 'guess',
    });

    expect(await asked(alice), 'one guess counted more than once').toBe(before + 1);
  });
});
