import type { Side } from '@twoends/core';

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
  choice: Side;
}

/** What each of you chose, per card. `theirs` stays null until yours exists. */
export interface CardState {
  mine: Side | null;
  theirs: Side | null;
}

export type Board = Map<string, CardState>;

/**
 * Everything the server is willing to show.
 *
 * Their rows simply do not come back until you have picked — that is the
 * reveal policy in migration 16, not a filter applied here. This function
 * cannot show you their pick early even if it wanted to, which is the property
 * worth having.
 */
export async function loadBoard(coupleId: string, myId: string): Promise<Board> {
  const { data } = await supabase
    .from('game_picks')
    .select('card_id, profile_id, choice')
    .eq('couple_id', coupleId);

  const board: Board = new Map();
  for (const row of (data as Pick[] | null) ?? []) {
    const entry = board.get(row.card_id) ?? { mine: null, theirs: null };
    if (row.profile_id === myId) entry.mine = row.choice;
    else entry.theirs = row.choice;
    board.set(row.card_id, entry);
  }
  return board;
}

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
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('game_picks').upsert(
    {
      couple_id: input.coupleId,
      card_id: input.cardId,
      profile_id: input.profileId,
      choice: input.choice,
    },
    { onConflict: 'couple_id,card_id,profile_id' },
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
