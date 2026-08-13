import { computeStreak, localDateIn, weekMarks, type DayMark } from '@twoends/core';
import { create } from 'zustand';

import { loadCanvas, type SharedCanvas } from '../db/canvas.ts';
import { completedDays } from '../db/daily.ts';
import {
  openedCapsules,
  sealedCapsules,
  type OpenCapsule,
  type SealedCapsule,
} from '../db/capsules.ts';
import { recentEntries, type JournalEntry } from '../db/journal.ts';
import { recentSnaps, signedUrls, type Snap } from '../db/photos.ts';
import { syncWidgets } from '../lib/widgets.ts';
import { useSession, type Couple } from './session.ts';

/**
 * The shared surfaces: the latest snap, the latest drawing, and the streak.
 *
 * One store because Home renders all three at once and they are all invalidated
 * by the same events — a partner sending something, or the app coming back to
 * the foreground.
 *
 * Signed URLs are held here too. The buckets are private, so every image needs
 * one, and fetching them per-component would mean the same photo asking for
 * three different links.
 */
interface SharedState {
  snaps: Snap[];
  urls: Map<string, string>;
  canvas: SharedCanvas | null;
  entries: JournalEntry[];
  sealed: SealedCapsule[];
  opened: OpenCapsule[];
  streak: { current: number; longest: number };
  week: DayMark[];
  loaded: boolean;

  load: (couple: Couple) => Promise<void>;
  /** Optimistic keep toggle; the write follows. */
  markKept: (id: string, kept: boolean) => void;
  /** Optimistic removal, so a deleted snap leaves the list at once. */
  dropSnap: (id: string) => void;
  clear: () => void;
}

export const useShared = create<SharedState>((set) => ({
  snaps: [],
  urls: new Map(),
  canvas: null,
  entries: [],
  sealed: [],
  opened: [],
  streak: { current: 0, longest: 0 },
  week: ['future', 'future', 'future', 'future', 'future', 'future', 'future'],
  loaded: false,

  load: async (couple) => {
    const [snaps, canvas, days, entries, sealed, opened] = await Promise.all([
      recentSnaps(couple.id),
      loadCanvas(couple.id),
      completedDays(couple.id),
      recentEntries(couple.id),
      sealedCapsules(),
      openedCapsules(couple.id),
    ]);

    const urls = await signedUrls(snaps.map((s) => s.storage_path));

    // The couple's day, not this device's — the streak has to agree on both
    // phones even when they are in different timezones.
    const today = localDateIn(couple.day_timezone ?? 'UTC');
    const streak = computeStreak(days, today);

    const week = weekMarks(days, today);

    set({
      snaps,
      urls,
      canvas,
      entries,
      sealed,
      opened,
      streak: { current: streak.current, longest: streak.longest },
      week,
      loaded: true,
    });

    /*
      Push the same state out to the home screen.

      Not awaited: this runs on every foreground and after every send, and the
      screen must never wait on a widget redraw. A failure here costs a stale
      widget until the next load — the app itself is already correct.
    */
    const { profile, partner } = useSession.getState();
    void syncWidgets({
      myId: profile?.id ?? null,
      myName: profile?.display_name ?? '',
      theirName: partner?.display_name ?? '',
      myAccentKey: profile?.accent_key ?? 'coral',
      theirAccentKey: partner?.accent_key ?? 'rose',
      coupleId: couple.id,
      startedOn: couple.started_on ?? null,
      snaps,
      canvas,
      streak: { current: streak.current },
      week,
    });
  },

  markKept: (id, kept) =>
    set((state) => ({
      snaps: state.snaps.map((s) => (s.id === id ? { ...s, kept } : s)),
    })),

  dropSnap: (id) => set((state) => ({ snaps: state.snaps.filter((s) => s.id !== id) })),

  clear: () =>
    set({
      snaps: [],
      urls: new Map(),
      canvas: null,
      entries: [],
      sealed: [],
      opened: [],
      loaded: false,
    }),
}));
