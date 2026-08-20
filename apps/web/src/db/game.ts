import { deterministicId, type GuessCard, type Side } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';

/**
 * This or that — the picks, and only the picks.
 *
 * Straight to Supabase rather than through Dexie and the outbox, which is the
 * same choice `asks.ts` and `capsules.ts` made and for the same reason: the
 * whole point of a pick is what the *other* person did with it. A queued pick
 * that reveals nothing until the phone finds signal is not offline support, it
 * is a spinner with extra steps — so the screen says plainly when it could not
 * reach the server instead of pretending.
 *
 * The deck itself ships in the bundle and needs no network at all, so a card is
 * always readable. It is the answer that has to travel.
 */

export interface Pick {
  card_id: string;
  profile_id: string;
  choice: Side | null;
  guess: Side | null;
  mode: 'match' | 'guess';
  /** The day it was last answered. Only read when a card comes round again. */
  picked_on: string | null;
}

/** What each of you chose, per card. `theirs` stays null until yours exists. */
export interface CardState {
  mine: Side | null;
  theirs: Side | null;
  /** What you think they would pick. Null outside a guessing round. */
  myGuess: Side | null;
  theirGuess: Side | null;
  /** When you last answered. Null until you have. */
  myPickedOn: string | null;
  theirPickedOn: string | null;
}

export type Board = Map<string, CardState>;

/**
 * One board per game.
 *
 * Not one map keyed by card, which is what this was until the two games stopped
 * sharing rows. A card can now hold a this-or-that pick *and* a guess from the
 * same person, and folding both into one entry meant whichever loaded second
 * silently overwrote the other — a pick vanishing because you had guessed on it
 * a week earlier.
 */
export interface Boards {
  match: Board;
  guess: Board;
}

/**
 * Everything the server is willing to show.
 *
 * Their rows simply do not come back until you have picked — that is the
 * reveal policy in migration 16, not a filter applied here. This function
 * cannot show you their pick early even if it wanted to, which is the property
 * worth having.
 */
export async function loadBoard(coupleId: string, myId: string): Promise<Boards> {
  const { data } = await supabase
    .from('game_picks')
    .select('card_id, profile_id, choice, guess, mode, picked_on')
    .eq('couple_id', coupleId);

  const boards: Boards = { match: new Map(), guess: new Map() };

  for (const row of (data as Pick[] | null) ?? []) {
    const board = row.mode === 'guess' ? boards.guess : boards.match;
    const entry = board.get(row.card_id) ?? {
      mine: null,
      theirs: null,
      myGuess: null,
      theirGuess: null,
      myPickedOn: null,
      theirPickedOn: null,
    };

    if (row.profile_id === myId) {
      entry.mine = row.choice;
      entry.myGuess = row.guess;
      entry.myPickedOn = row.picked_on;
    } else {
      entry.theirs = row.choice;
      entry.theirGuess = row.guess;
      entry.theirPickedOn = row.picked_on;
    }

    board.set(row.card_id, entry);
  }

  return boards;
}

/** An untouched card, so callers never have to spell the empty shape out. */
export const EMPTY_CARD: CardState = {
  mine: null,
  theirs: null,
  myGuess: null,
  theirGuess: null,
  myPickedOn: null,
  theirPickedOn: null,
};

/**
 * Chooses a side, or changes your mind.
 *
 * Upserted on the unique key rather than inserted, because changing your mind
 * before they have picked is a normal thing to do and a second row would make
 * the tally count you twice. The database refuses to let this write anyone
 * else's row regardless of what is passed in.
 */
export async function choose(input: {
  coupleId: string;
  cardId: string;
  profileId: string;
  choice: Side;
  /** The couple's local date, so a card coming round can say when. */
  today: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('game_picks').upsert(
    {
      couple_id: input.coupleId,
      card_id: input.cardId,
      profile_id: input.profileId,
      choice: input.choice,
      mode: 'match',
      picked_on: input.today,
    },
    // The key gained `mode` in migration 22: a card played in two games is two
    // events. Without it here, picking would collide with a guess on the same
    // card and one of them would silently overwrite the other.
    { onConflict: 'couple_id,card_id,profile_id,mode' },
  );

  return { error: error?.message ?? null };
}

/**
 * How many you have both played, and how often you agreed.
 *
 * Counted by the database — see `game_tally` — so the number comes from the
 * same place the reveal rule does rather than from a client adding up rows it
 * may only be seeing half of.
 */
export async function loadTally(coupleId: string): Promise<{ played: number; agreed: number }> {
  const { data } = await supabase.rpc('game_tally', { p_couple_id: coupleId });
  const row = (data as { played: number; agreed: number }[] | null)?.[0];
  return { played: row?.played ?? 0, agreed: row?.agreed ?? 0 };
}

/**
 * Starts the deck over.
 *
 * Deletes only your own picks; theirs are not yours to throw away. That means
 * one of you can replay while the other keeps their answers, which is the
 * honest behaviour — and the partner sees the card go back to "waiting on you"
 * rather than silently losing what they chose.
 */
export async function forgetMyPicks(coupleId: string, myId: string): Promise<void> {
  await supabase.from('game_picks').delete().eq('couple_id', coupleId).eq('profile_id', myId);
}

// ── do you know me? ──────────────────────────────────────────────────────────

/**
 * A guess, and — on a deck card — your own answer with it.
 *
 * **Both in one write, deliberately.** The reveal opens as soon as you have a
 * row, so writing the choice half first would hand you their answer and leave
 * you free to fill in a guess you could no longer get wrong. `mode = 'guess'`
 * carries a check constraint that the guess is present, so a half-written row
 * of this kind cannot exist at all — the rule is in the database rather than in
 * the order these two fields happen to be assigned here.
 *
 * On a card they wrote about themselves there is no choice of your own to give:
 * the question is about them, so "what would you pick" was never asked.
 */
export async function sendGuess(input: {
  coupleId: string;
  cardId: string;
  profileId: string;
  guess: Side;
  /** Your own answer too, on a shared deck card. Omitted on one they wrote. */
  choice?: Side;
  today: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('game_picks').upsert(
    {
      couple_id: input.coupleId,
      card_id: input.cardId,
      profile_id: input.profileId,
      choice: input.choice ?? null,
      guess: input.guess,
      mode: 'guess',
      picked_on: input.today,
    },
    { onConflict: 'couple_id,card_id,profile_id,mode' },
  );

  return { error: error?.message ?? null };
}

/** A written card, with the two things only the app needs to know about it. */
export interface WrittenCard extends GuessCard {
  kind: 'match' | 'guess';
  isAdult: boolean;
}

/** The cards the two of you wrote. Theirs are the ones you get to guess. */
export async function loadWrittenCards(coupleId: string): Promise<WrittenCard[]> {
  const { data } = await supabase
    .from('couple_cards')
    .select('id, body, option_a, option_b, author_id, kind, is_adult')
    .eq('couple_id', coupleId)
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as {
    id: string;
    body: string | null;
    option_a: string;
    option_b: string;
    author_id: string;
    kind: 'match' | 'guess';
    is_adult: boolean;
  }[];

  return rows.map((row) => ({
    id: row.id,
    body: row.body,
    a: row.option_a,
    b: row.option_b,
    authorId: row.author_id,
    kind: row.kind,
    isAdult: row.is_adult,
  }));
}

/**
 * Writes a card about yourself, and your own answer to it.
 *
 * The answer goes first, and the order matters. If the card lands and the
 * answer does not, your partner is handed a question nobody has answered and
 * waits for a reveal that never comes. If the answer lands and the card does
 * not, the row is invisible — there is no card to show it on — and nothing is
 * broken for anybody. So the failure that costs nothing is the one made
 * possible.
 *
 * The answer is an ordinary pick, which is what makes this work without a secret
 * column anywhere: the reveal policy on `game_picks` already hides it until they
 * have guessed. A `truth` column on `couple_cards` would be readable by both of
 * them the moment it was written, because row-level security cannot hide a
 * column, and the game would be over before it began.
 */
export async function writeCard(input: {
  coupleId: string;
  authorId: string;
  body: string;
  optionA: string;
  optionB: string;
  answer: Side;
  today: string;
  /** Which game it is for. `guess` is a card about you; `match` joins the deck. */
  kind?: 'match' | 'guess';
  isAdult?: boolean;
}): Promise<{ error: string | null; id: string }> {
  const body = input.body.trim();
  const a = input.optionA.trim();
  const b = input.optionB.trim();

  // Derived from the words, exactly as the shipped deck's ids are — so editing
  // a card makes a new one rather than silently rewriting a question somebody
  // has already answered. The body is in the hash too, which also keeps a
  // written card from ever colliding with a deck card of the same two options.
  const id = deterministicId('twoends.card', `${body}|${a}|${b}`);

  /*
    Written as a `guess`-mode row, not a this-or-that pick.

    Answering a card you wrote *is* your move in the guessing game, even though
    you never guess at anything — and migration 22 made the reveal per-game, so
    filing it under the wrong game meant the person guessing could never see what
    they were guessing at. See migration 23, which is that mistake being undone.
  */
  const pick = await supabase.from('game_picks').upsert(
    {
      couple_id: input.coupleId,
      card_id: id,
      profile_id: input.authorId,
      choice: input.answer,
      mode: 'guess',
      picked_on: input.today,
    },
    { onConflict: 'couple_id,card_id,profile_id,mode' },
  );
  if (pick.error) return { error: pick.error.message, id };

  const card = await supabase.from('couple_cards').insert({
    id,
    couple_id: input.coupleId,
    author_id: input.authorId,
    body: body || null,
    option_a: a,
    option_b: b,
    kind: input.kind ?? 'guess',
    is_adult: input.isAdult ?? false,
  });

  // A card written twice is the same card, by construction. Not an error.
  const duplicate = card.error?.code === '23505';
  return { error: duplicate ? null : (card.error?.message ?? null), id };
}

/** Takes back a card you wrote. Only the author may, and only their own. */
export async function removeCard(id: string): Promise<void> {
  await supabase.from('couple_cards').delete().eq('id', id);
}

export interface Knowing {
  /** Cards you guessed on where they had answered. */
  asked: number;
  gotRight: number;
}

/**
 * How well each of you knew the other, counted by the database.
 *
 * Cards they have not answered yet are left out of both numbers rather than
 * counted as misses — waiting is not wrong, and a tally that conflated the two
 * would tell somebody they had failed a question nobody has answered.
 */
export async function loadKnowing(
  coupleId: string,
  myId: string,
): Promise<{ mine: Knowing; theirs: Knowing }> {
  const { data } = await supabase.rpc('guess_tally', { p_couple_id: coupleId });
  const rows = (data as { profile_id: string; asked: number; got_right: number }[] | null) ?? [];

  const read = (id: string | null): Knowing => {
    const row = id ? rows.find((r) => r.profile_id === id) : rows.find((r) => r.profile_id !== myId);
    return { asked: row?.asked ?? 0, gotRight: row?.got_right ?? 0 };
  };

  return { mine: read(myId), theirs: read(null) };
}
