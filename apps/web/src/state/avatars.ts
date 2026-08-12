import { create } from 'zustand';

import { signedAvatarUrls } from '../db/avatars.ts';

/**
 * Signed URLs for the two faces.
 *
 * Held once rather than fetched per component: an avatar appears on the home
 * screen, in the daily card, on every snap and beside every journal entry, and
 * signing the same path eight times would be eight round trips for one picture.
 */
interface AvatarState {
  urls: Map<string, string>;
  load: (paths: (string | null | undefined)[]) => Promise<void>;
}

export const useAvatars = create<AvatarState>((set, get) => ({
  urls: new Map(),

  load: async (paths) => {
    const wanted = paths.filter((p): p is string => Boolean(p));
    const have = get().urls;

    // Nothing new to sign — avoid a request per render.
    if (wanted.every((p) => have.has(p))) return;

    const fresh = await signedAvatarUrls(wanted);
    set({ urls: new Map([...have, ...fresh]) });
  },
}));
