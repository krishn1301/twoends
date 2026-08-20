import type { Side } from '@twoends/core';
import { create } from 'zustand';

import {
  EMPTY_CARD,
  choose,
  forgetMyPicks,
  loadBoard,
  loadKnowing,
  loadTally,
  loadWrittenCards,
  sendGuess,
  writeCard,
  type Boards,
  type Knowing,
  type WrittenCard,
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
  /** One board per game — a card can hold a pick and a guess at once. */
  boards: Boards;
  tally: { played: number; agreed: number };
  /** How well each of you guessed the other. Both, always — see `guessing.ts`. */
  knowing: { mine: Knowing; theirs: Knowing };
  /** The cards the two of you wrote, theirs and yours. */
  written: WrittenCard[];
  /** Set when a pick could not be sent. Cleared by the next successful one. */
  error: string | null;

  load: (coupleId: string, myId: string) => Promise<void>;
  pick: (input: {
    coupleId: string;
    myId: string;
    cardId: string;
    choice: Side;
    today: string;
  }) => Promise<void>;
  /** A guess, with your own answer beside it on a shared deck card. */
  guess: (input: {
    coupleId: string;
    myId: string;
    cardId: string;
    guess: Side;
    choice?: Side;
    today: string;
  }) => Promise<void>;
  /** Writes a card about yourself, with the answer, for them to guess. */
  compose: (input: {
    coupleId: string;
    myId: string;
    body: string;
    optionA: string;
    optionB: string;
    answer: Side;
    today: string;
    kind: 'match' | 'guess';
    isAdult: boolean;
  }) => Promise<{ error: string | null }>;
  /** Throws away only your own picks. Theirs are not yours to delete. */
  reset: (coupleId: string, myId: string) => Promise<void>;
  clear: () => void;
}

const EMPTY: Boards = { match: new Map(), guess: new Map() };

export const useGame = create<GameState>((set, get) => ({
  boards: EMPTY,
  tally: { played: 0, agreed: 0 },
  knowing: { mine: NO_KNOWING, theirs: NO_KNOWING },
  written: [],
  error: null,

  load: async (coupleId, myId) => {
    const [boards, tally, knowing, written] = await Promise.all([
      loadBoard(coupleId, myId),
      loadTally(coupleId),
      loadKnowing(coupleId, myId),
      loadWrittenCards(coupleId),
    ]);
    set({ boards, tally, knowing, written });
  },

  pick: async ({ coupleId, myId, cardId, choice, today }) => {
    /*
      Optimistic, because the tap has to feel like a tap. The only thing at
      stake if the write fails is a highlight that snaps back on the reload
      below, and the message says so rather than leaving a lie on screen.
    */
    const optimistic = new Map(get().boards.match);
    const was = optimistic.get(cardId);
    optimistic.set(cardId, {
      ...(was ?? EMPTY_CARD),
      mine: choice,
      myPickedOn: today,
    });
    set({ boards: { ...get().boards, match: optimistic }, error: null });

    const { error } = await choose({ coupleId, cardId, profileId: myId, choice, today });
    if (error) {
      set({ error: 'Could not send that — it needs signal to reach them.' });
    }

    await get().load(coupleId, myId);
  },

  guess: async ({ coupleId, myId, cardId, guess, choice, today }) => {
    /*
      Optimistic, like a pick — the tap has to feel like a tap. Both halves go
      into one row, which is not a detail: `mode = 'guess'` cannot exist without
      a guess in it, so there is no window where the reveal has opened and the
      guess is still blank.
    */
    const optimistic = new Map(get().boards.guess);
    const was = optimistic.get(cardId);
    optimistic.set(cardId, {
      ...(was ?? EMPTY_CARD),
      mine: choice ?? was?.mine ?? null,
      myGuess: guess,
      myPickedOn: today,
    });
    set({ boards: { ...get().boards, guess: optimistic }, error: null });

    const { error } = await sendGuess({ coupleId, cardId, profileId: myId, guess, choice, today });
    if (error) set({ error: 'Could not send that — it needs signal to reach them.' });

    await get().load(coupleId, myId);
  },

  compose: async ({ coupleId, myId, body, optionA, optionB, answer, today, kind, isAdult }) => {
    const { error } = await writeCard({
      coupleId,
      authorId: myId,
      body,
      optionA,
      optionB,
      answer,
      today,
      kind,
      isAdult,
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
      boards: EMPTY,
      tally: { played: 0, agreed: 0 },
      knowing: { mine: NO_KNOWING, theirs: NO_KNOWING },
      written: [],
      error: null,
    }),
}));
