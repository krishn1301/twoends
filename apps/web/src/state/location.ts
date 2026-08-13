import { readDistance, type Reading } from '@twoends/core';
import { create } from 'zustand';

import { useNow } from './useNow.ts';
import {
  EMPTY_PRESENCE,
  loadPresence,
  locationState,
  pushPosition,
  setWantsPrecise,
  stopSharing,
  type LocationState,
  type Presence,
} from '../db/location.ts';

/**
 * Where the two of you are, as one number.
 *
 * Separate from `useShared` on purpose. Everything in that store is couple-wide
 * content that both people can always see; this is the one thing in the app that
 * either person can switch off unilaterally, and keeping it in its own store
 * means the switch is a visible line of code rather than a field buried in a
 * larger object.
 *
 * The store never holds a position it did not get from the server. There is no
 * "last known location" in memory, because a value that survives turning the
 * feature off is exactly the value this feature promises not to keep.
 */
interface LocationStore {
  presence: Presence;
  state: LocationState;
  busy: boolean;
  error: string | null;

  /** Reads both rows and, if sharing is on, refreshes my own position. */
  load: (myId: string) => Promise<void>;
  enable: (myId: string) => Promise<void>;
  disable: (myId: string) => Promise<void>;
  togglePrecise: (myId: string, wants: boolean) => Promise<void>;
  clear: () => void;
}

export const useLocation = create<LocationStore>((set, get) => ({
  presence: EMPTY_PRESENCE,
  state: 'off',
  busy: false,
  error: null,

  load: async (myId) => {
    const presence = await loadPresence(myId);
    set({ presence, state: await locationState(presence.sharing) });

    /*
      Refresh my own fix on the way past — this runs on mount and on every
      foreground, which is precisely the "foreground only" contract. Not awaited
      and not surfaced: a failed refresh leaves the previous position in place,
      and a permission prompt that appears because the app came back from the
      background would be startling.
    */
    if (!presence.sharing) return;
    void pushPosition(myId, presence.wantsPrecise).then(async ({ error }) => {
      if (error) return;
      set({ presence: await loadPresence(myId) });
    });
  },

  enable: async (myId) => {
    set({ busy: true, error: null });
    // This is the call that raises the browser's permission prompt, and it only
    // ever happens here — from a tap, on this screen, with the explanation
    // beside it.
    const { error } = await pushPosition(myId, get().presence.wantsPrecise);
    const presence = await loadPresence(myId);
    set({ presence, state: await locationState(presence.sharing), busy: false, error });
  },

  disable: async (myId) => {
    set({ busy: true, error: null });
    await stopSharing(myId);
    const presence = await loadPresence(myId);
    set({ presence, state: await locationState(presence.sharing), busy: false });
  },

  togglePrecise: async (myId, wants) => {
    set({ busy: true, error: null });
    await setWantsPrecise(myId, wants);
    // Re-read the position at the new resolution rather than waiting for the
    // next foreground; otherwise agreeing to precise leaves you both looking at
    // a rounded number and wondering whether the switch did anything.
    if (get().presence.sharing) await pushPosition(myId, wants);
    const presence = await loadPresence(myId);
    set({ presence, busy: false });
  },

  clear: () => set({ presence: EMPTY_PRESENCE, state: 'off', error: null }),
}));

/**
 * The reading, already phrased.
 *
 * A hook rather than a field on the store because it depends on the partner's
 * name and on the current time, neither of which belongs in stored state. The
 * name is a parameter rather than a read of `useSession` so that this module
 * imports no other store — `session.ts` needs to call `clear()` on sign-out, and
 * the two importing each other is a cycle that resolves differently in the
 * production bundle than it does in dev.
 */
export function useDistanceReading(theirName?: string | null): Reading {
  const presence = useLocation((s) => s.presence);
  // A minute is plenty: the only thing time changes here is whether a fix has
  // gone stale, and that boundary is three days away.
  const now = useNow(60_000);

  return readDistance({
    mine: presence.mine,
    theirs: presence.theirs,
    precision: presence.precision,
    theirName: theirName ?? undefined,
    nowMs: now.getTime(),
  });
}
