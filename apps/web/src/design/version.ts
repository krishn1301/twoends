import { create } from 'zustand';

/**
 * Which look the app is wearing.
 *
 * The visual review in `TWOENDS_VISUAL_CHANGES.md` proposes fifteen changes,
 * and the request that came with them was that **the original has to still be
 * there** — so this is a switch rather than a rewrite. Every change in that
 * document is gated on this value, and `classic` is the app exactly as it
 * shipped: same tokens, same layouts, same colours, byte for byte.
 *
 * Why a runtime switch rather than a build flag or a branch. The changes have
 * to be compared *on a phone*, on the two accounts they were designed for, in
 * the light people actually use the app in. A build flag means two deploys and
 * a reinstall to see the other one; a branch means neither of you can look at
 * both. This is one tap in Us, and it survives a reload.
 *
 * The cost, paid knowingly: every screen that changed carries both versions,
 * and a third look would mean a third branch in each of them. That is the wrong
 * shape for a permanent feature and the right shape for a decision that is
 * about to be made. **When one of the two wins, the other one gets deleted and
 * this file goes with it.**
 *
 * Two halves:
 *
 *  - CSS. `data-design` lands on `<html>`, and `theme.css` redefines the
 *    elevation tokens under `[data-design='v2']`. Anything that is only a
 *    colour needs no TypeScript at all — the utilities already point at the
 *    variables.
 *  - Structure. Screens read `useDesignVersion()` where the change is a layout
 *    or a component, not a colour.
 */
export type DesignVersion = 'classic' | 'v2';

const KEY = 'twoends.design';

/** The look a fresh install gets. */
const DEFAULT: DesignVersion = 'v2';

const isVersion = (value: string | null): value is DesignVersion =>
  value === 'classic' || value === 'v2';

/**
 * `?design=classic` sets the switch and sticks.
 *
 * A one-off override that did *not* stick would leave the toggle in Us
 * disagreeing with the screen it is sitting on, which is a worse bug than
 * anything this is meant to help judge.
 */
function fromUrl(): DesignVersion | null {
  try {
    const asked = new URLSearchParams(window.location.search).get('design');
    return isVersion(asked) ? asked : null;
  } catch {
    return null;
  }
}

function read(): DesignVersion {
  const asked = fromUrl();
  if (asked) {
    write(asked);
    return asked;
  }
  try {
    const saved = localStorage.getItem(KEY);
    return isVersion(saved) ? saved : DEFAULT;
  } catch {
    // Private browsing. The default is the honest answer, and being wrong here
    // costs one tap rather than anything a person would notice.
    return DEFAULT;
  }
}

function write(version: DesignVersion): void {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    // The look reverts on the next launch. Nothing else breaks.
  }
}

/**
 * Put it on the document so CSS can see it.
 *
 * Called once at import time from `main.tsx`, which runs before the first
 * render and therefore before the first paint — otherwise a person who chose
 * `classic` would watch the app flash the other look on every launch.
 */
function apply(version: DesignVersion): void {
  document.documentElement.dataset.design = version;
}

interface DesignVersionState {
  version: DesignVersion;
  set: (version: DesignVersion) => void;
}

export const useDesignVersion = create<DesignVersionState>((set) => ({
  version: read(),
  set: (version) => {
    write(version);
    apply(version);
    set({ version });
  },
}));

/** Run before the first render. Exported so `main.tsx` says so out loud. */
export function startDesignVersion(): void {
  apply(useDesignVersion.getState().version);
}

/** Sugar for the common `version === 'v2'` test inside a component. */
export const useIsV2 = (): boolean => useDesignVersion((s) => s.version === 'v2');

/**
 * The interface colour: everything a person did not author.
 *
 * **Item 1 was tried and reverted.** For a while this returned a fixed warm
 * bone in the proposed look, so that `mine` and `theirs` could be reserved
 * strictly for authorship. The argument was sound and the result was not: the
 * moment you pick a colour on the first screen the whole app used to become it,
 * and that is the thing people actually notice about this app. Taking it away
 * to win a rule made every screen after the picker read as somebody else's.
 *
 * So it is the person's own accent again, in both looks. The plumbing stays
 * because it is one honest place to make that decision, and because every call
 * site that means *interface* now says so rather than saying `mine` and leaving
 * the reader to work out which of the two jobs it is doing.
 *
 * Screens that need nothing else from the design model take this rather than
 * `useDesignModel()`, which runs a one-second ticker for the anniversary
 * counter and has no business being mounted for the sake of a button.
 */
export function useChrome(mine: string): string {
  return mine;
}
