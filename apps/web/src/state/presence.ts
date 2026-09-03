import { create } from 'zustand';

import { supabase } from '../lib/supabase.ts';
import type { Drawing, Stroke } from '@twoends/core';

/**
 * Whether the other person has the app open right now.
 *
 * **Nothing is written down.** No table, no `last_seen`, no log of when either
 * of them was online — presence exists in the moment and leaves no record, and
 * that is a design position rather than an oversight. The same feature built
 * with history is a surveillance tool inside a relationship: "you were online
 * at 2am and did not answer me" is a sentence this app must never be able to
 * support. Realtime presence is held in the server's memory and disappears when
 * the socket does, which is exactly the property wanted.
 *
 * The channel carries one other thing: strokes, while both of them are here, so
 * the shared canvas draws on the other screen as it is being drawn rather than
 * on send. Those are broadcast, not stored — the canvas row is still written
 * the ordinary way when a drawing is finished.
 */

interface PresenceState {
  /** True only when the other person is on the channel too. */
  bothHere: boolean;
  /** Live strokes from them, since this session joined. Never persisted. */
  incoming: Stroke[];

  join: (coupleId: string, myId: string) => void;
  leave: () => void;
  /** Sends a finished stroke to the other screen, if they are looking. */
  sendStroke: (stroke: Stroke) => void;
  /** Sends a whole drawing, for an undo or a clear. */
  sendDrawing: (drawing: Drawing) => void;
  clearIncoming: () => void;
}

type Channel = ReturnType<typeof supabase.channel>;

let channel: Channel | null = null;
let joined: { coupleId: string; myId: string } | null = null;

export const usePresence = create<PresenceState>((set, get) => ({
  bothHere: false,
  incoming: [],

  join: (coupleId, myId) => {
    // Already on the right channel. Rejoining on every visibility change would
    // drop the socket and make the other person watch you flicker.
    if (joined?.coupleId === coupleId && joined.myId === myId && channel) return;

    get().leave();

    const next = supabase.channel(`presence:${coupleId}`, {
      config: { presence: { key: myId } },
    });

    const look = () => {
      const here = Object.keys(next.presenceState());
      // Somebody other than me on the channel. Not a count: two tabs on one
      // phone are one person, and the key is the profile id for that reason.
      set({ bothHere: here.some((key) => key !== myId) });
    };

    next
      .on('presence', { event: 'sync' }, look)
      .on('presence', { event: 'join' }, look)
      .on('presence', { event: 'leave' }, look)
      .on('broadcast', { event: 'stroke' }, ({ payload }) => {
        const stroke = (payload as { stroke?: Stroke }).stroke;
        if (stroke) set((state) => ({ incoming: [...state.incoming, stroke] }));
      });

    void next.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      // Tracking nothing but the fact of being here. A payload would be a
      // record of something, and there is deliberately nothing to record.
      void next.track({});
    });

    channel = next;
    joined = { coupleId, myId };
  },

  leave: () => {
    if (channel) void supabase.removeChannel(channel);
    channel = null;
    joined = null;
    set({ bothHere: false, incoming: [] });
  },

  sendStroke: (stroke) => {
    if (!channel || !get().bothHere) return;
    void channel.send({ type: 'broadcast', event: 'stroke', payload: { stroke } });
  },

  sendDrawing: (drawing) => {
    if (!channel || !get().bothHere) return;
    void channel.send({ type: 'broadcast', event: 'drawing', payload: { drawing } });
  },

  clearIncoming: () => set({ incoming: [] }),
}));
