import type { GuessCard, Side } from '@twoends/core';
import { create } from 'zustand';

import {
  choose,
  forgetMyPicks,
  loadBoard,
  loadKnowing,
  loadTally,
  loadWrittenCards,
  sendGuess,
  writeCard,
  type Board,
  type Knowing,
} from '../db/game.ts';

/**
 * The game board, in a store rather than in component state.
 *
 * Same reason `today.ts` gives: the screen is not the only thing that wants
 * this. Realtime pushes into it from outside React, the tally has to agree with
 * the cards it was counted from, and a component that owned all of it would
 * refetch the lot every time somebody switched tabs.
 *
 * It also keeps `set` on the far side of an external store, which is what makes
 * the loads legal under `react-hooks/set-state-in-effect` — the rule is right
 * that an effect calling setState synchronously cascades, and the shape it
 * wants is exactly this one.
 */

const NO_KNOWING: Knowing = { asked: 0, gotRight: 0 };

interface GameState {
  board: Board;
  tally: { played: number; agreed: number };
  /** How well each of you guessed the other. Both, always — see `guessing.ts`. */
  knowing: { mine: Knowing; theirs: Knowing };
  /** The cards the two of you wrote, theirs and yours. */
  written: GuessCard[];
  /** Set when a pick could not be sent. Cleared by the next successful one. */
  error: string | null;

  load: (coupleId: string, myId: string) => Promise<void>;
  pick: (input: {
    coupleId: string;
    myId: string;
    cardId: string;
    choice: Side;
  }) => Promise<void>;
  /** A guess, with your own answer beside it on a shared deck card. */
  guess: (input: {
    coupleId: string;
    myId: string;
    cardId: string;
    guess: Side;
    choice?: Side;
  }) => Promise<void>;
  /** Writes a card about yourself, with the answer, for them to guess. */
  compose: (input: {
    coupleId: string;
    myId: string;
    body: string;
    optionA: string;
    optionB: string;
    answer: Side;
  }) => Promise<{ error: string | null }>;
  /** Throws away only your own picks. Theirs are not yours to delete. */
  reset: (coupleId: string, myId: string) => Promise<void>;
  clear: () => void;
}

const EMPTY: Board = new Map();

export const useGame = create<GameState>((set, get) => ({
  board: EMPTY,
  tally: { played: 0, agreed: 0 },
  knowing: { mine: NO_KNOWING, theirs: NO_KNOWING },
  written: [],
  error: null,

  load: async (coupleId, myId) => {
    const [board, tally, knowing, written] = await Promise.all([
      loadBoard(coupleId, myId),
      loadTally(coupleId),
      loadKnowing(coupleId, myId),
      loadWrittenCards(coupleId),
    ]);
    set({ board, tally, knowing, written });
  },

  pick: async ({ coupleId, myId, cardId, choice }) => {
    /*
      Optimistic, because the tap has to feel like a tap. The only thing at
      stake if the write fails is a highlight that snaps back on the reload
      below, and the message says so rather than leaving a lie on screen.
    */
    const optimistic = new Map(get().board);
    const was = get().board.get(cardId);
    optimistic.set(cardId, {
      mine: choice,
      theirs: was?.theirs ?? null,
      myGuess: was?.myGuess ?? null,
      theirGuess: was?.theirGuess ?? null,
    });
    set({ board: optimistic, error: null });

    const { error } = await choose({ coupleId, cardId, profileId: myId, choice });
    if (error) {
      set({ error: 'Could not send that — it needs signal to reach them.' });
    }

    await get().load(coupleId, myId);
  },

  guess: async ({ coupleId, myId, cardId, guess, choice }) => {
    /*
      Optimistic, like a pick — the tap has to feel like a tap. Both halves go
      into one row, which is not a detail: `mode = 'guess'` cannot exist without
      a guess in it, so there is no window where the reveal has opened and the
      guess is still blank.
    */
    const optimistic = new Map(get().board);
    const was = get().board.get(cardId);
    optimistic.set(cardId, {
      mine: choice ?? was?.mine ?? null,
      theirs: was?.theirs ?? null,
      myGuess: guess,
      theirGuess: was?.theirGuess ?? null,
    });
    set({ board: optimistic, error: null });

    const { error } = await sendGuess({ coupleId, cardId, profileId: myId, guess, choice });
    if (error) set({ error: 'Could not send that — it needs signal to reach them.' });

    await get().load(coupleId, myId);
  },

  compose: async ({ coupleId, myId, body, optionA, optionB, answer }) => {
    const { error } = await writeCard({
      coupleId,
      authorId: myId,
      body,
      optionA,
      optionB,
      answer,
    });
    if (!error) await get().load(coupleId, myId);
    return { error };
  },

  reset: async (coupleId, myId) => {
    await forgetMyPicks(coupleId, myId);
    await get().load(coupleId, myId);
  },

  clear: () =>
    set({
      board: EMPTY,
      tally: { played: 0, agreed: 0 },
      knowing: { mine: NO_KNOWING, theirs: NO_KNOWING },
      written: [],
      error: null,
    }),
}));
