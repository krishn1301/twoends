import { create } from 'zustand';

import { loadToday, submitAnswer, type Today } from '../db/daily.ts';
import { notifyPartner } from '../db/push.ts';
import type { Couple, Profile } from './session.ts';

/**
 * Today's question, held in a store rather than in component state.
 *
 * Two reasons, and the linter's objection is the smaller one. The card, the
 * streak row and (in Phase 7) the widget bridge all want the same answer to
 * "what is today", and three copies fetched independently would disagree with
 * each other the moment one of them refreshed.
 */
interface TodayState {
  today: Today | null;
  busy: boolean;
  error: string | null;

  load: (couple: Couple, profile: Profile) => Promise<void>;
  answer: (couple: Couple, profile: Profile, body: string) => Promise<boolean>;
  clear: () => void;
}

export const useToday = create<TodayState>((set) => ({
  today: null,
  busy: false,
  error: null,

  load: async (couple, profile) => {
    const today = await loadToday(couple, profile.id);
    set({ today });
  },

  answer: async (couple, profile, body) => {
    set({ busy: true, error: null });
    const { error } = await submitAnswer(couple, profile.id, body);

    if (error) {
      set({ busy: false, error });
      return false;
    }

    // Re-read rather than patching locally: the partner's answer may now be
    // visible for the first time, and only the server knows that.
    const today = await loadToday(couple, profile.id);
    set({ today, busy: false });

    // Fire and forget: a push that fails must never make a written answer
    // look like it failed.
    notifyPartner('answered');
    return true;
  },

  clear: () => set({ today: null, error: null }),
}));
