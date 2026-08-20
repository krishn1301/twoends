import {
  computeStreak,
  isQuietNow,
  localDateIn,
  quietDays,
  readDistance,
  weekMarks,
  type DayMark,
  type QuietPeriod,
} from '@twoends/core';
import { create } from 'zustand';

import { loadCanvas, type SharedCanvas } from '../db/canvas.ts';
import { loadQuiet } from '../db/quiet.ts';
import { completedDays } from '../db/daily.ts';
import {
  openedCapsules,
  sealedCapsules,
  type OpenCapsule,
  type SealedCapsule,
} from '../db/capsules.ts';
import { recentEntries, type JournalEntry } from '../db/journal.ts';
import { loadComments, recentSnaps, signedUrls, type Snap, type SnapComment } from '../db/photos.ts';
import { syncWidgets } from '../lib/widgets.ts';
import { useLocation } from './location.ts';
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
  /** What either of you said about each snap, keyed by photo id. */
  comments: Map<string, SnapComment[]>;
  /** Every hush they have asked for, kept — see `quietDays`. */
  quiet: QuietPeriod[];
  /** Whether one is running right now. */
  quietNow: boolean;
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
  comments: new Map(),
  quiet: [],
  quietNow: false,
  canvas: null,
  entries: [],
  sealed: [],
  opened: [],
  streak: { current: 0, longest: 0 },
  week: ['future', 'future', 'future', 'future', 'future', 'future', 'future'],
  loaded: false,

  load: async (couple) => {
    const [snaps, canvas, days, entries, sealed, opened, comments, quiet] = await Promise.all([
      recentSnaps(couple.id),
      loadCanvas(couple.id),
      completedDays(couple.id),
      recentEntries(couple.id),
      sealedCapsules(),
      openedCapsules(couple.id),
      loadComments(couple.id),
      loadQuiet(couple.id),
    ]);

    const urls = await signedUrls(snaps.map((s) => s.storage_path));

    // The couple's day, not this device's — the streak has to agree on both
    // phones even when they are in different timezones.
    const today = localDateIn(couple.day_timezone ?? 'UTC');

    /*
      The set `computeStreak` has accepted since Phase 2 and had never once been
      given. Without it a week they asked to be excused from breaks the streak —
      not while quiet mode is on, but on the morning it lifts, which reads as a
      bug in the streak rather than as the promise it actually is.
    */
    const streak = computeStreak(days, today, quietDays(quiet, today));

    const week = weekMarks(days, today);

    set({
      snaps,
      urls,
      comments,
      quiet,
      quietNow: isQuietNow(quiet, today),
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
    const { presence } = useLocation.getState();

    void syncWidgets({
      myId: profile?.id ?? null,
      myName: profile?.display_name ?? '',
      theirName: partner?.display_name ?? '',
      myAccentKey: profile?.accent_key ?? 'coral',
      theirAccentKey: partner?.accent_key ?? 'rose',
      coupleId: couple.id,
      startedOn: couple.started_on ?? null,
      // Anchors, so a widget can work out that today is the day without the app
      // having been opened — which is the only morning it matters on.
      myBirthday: profile?.birthday ?? null,
      theirBirthday: partner?.birthday ?? null,
      // Both faces. The widgets were text on black until these two lines existed
      // — every other field was already here.
      myAvatarPath: profile?.avatar_path ?? null,
      theirAvatarPath: partner?.avatar_path ?? null,
      snaps,
      canvas,
      streak: { current: streak.current },
      week,
      distance: readDistance({
        mine: presence.mine,
        theirs: presence.theirs,
        precision: presence.precision,
        theirName: partner?.display_name,
        nowMs: Date.now(),
      }),
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
