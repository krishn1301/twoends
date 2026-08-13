import type { Side } from '@twoends/core';
import { create } from 'zustand';

import { choose, forgetMyPicks, loadBoard, loadTally, type Board } from '../db/game.ts';

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

interface GameState {
  board: Board;
  tally: { played: number; agreed: number };
  /** Set when a pick could not be sent. Cleared by the next successful one. */
  error: string | null;

  load: (coupleId: string, myId: string) => Promise<void>;
  pick: (input: {
    coupleId: string;
    myId: string;
    cardId: string;
    choice: Side;
  }) => Promise<void>;
  /** Throws away only your own picks. Theirs are not yours to delete. */
  reset: (coupleId: string, myId: string) => Promise<void>;
  clear: () => void;
}

const EMPTY: Board = new Map();

export const useGame = create<GameState>((set, get) => ({
  board: EMPTY,
  tally: { played: 0, agreed: 0 },
  error: null,

  load: async (coupleId, myId) => {
    const [board, tally] = await Promise.all([loadBoard(coupleId, myId), loadTally(coupleId)]);
    set({ board, tally });
  },

  pick: async ({ coupleId, myId, cardId, choice }) => {
    /*
      Optimistic, because the tap has to feel like a tap. The only thing at
      stake if the write fails is a highlight that snaps back on the reload
      below, and the message says so rather than leaving a lie on screen.
    */
    const optimistic = new Map(get().board);
    optimistic.set(cardId, { mine: choice, theirs: get().board.get(cardId)?.theirs ?? null });
    set({ board: optimistic, error: null });

    const { error } = await choose({ coupleId, cardId, profileId: myId, choice });
    if (error) {
      set({ error: 'Could not send that — it needs signal to reach them.' });
    }

    await get().load(coupleId, myId);
  },

  reset: async (coupleId, myId) => {
    await forgetMyPicks(coupleId, myId);
    await get().load(coupleId, myId);
  },

  clear: () => set({ board: EMPTY, tally: { played: 0, agreed: 0 }, error: null }),
}));
