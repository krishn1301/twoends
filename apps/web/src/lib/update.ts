import { Capacitor } from '@capacitor/core';

/**
 * Whether there is a newer APK than the one you are running.
 *
 * The Android app ships the web bundle inside it, so a web change only reaches
 * a phone as a new APK. There is no auto-update — a sideloaded app has no store
 * to push it — and the signing key is stable, so a new one installs over the
 * old without uninstalling and the pairing survives. What was missing was any
 * way to find out there *is* a new one.
 *
 * **It only ever asks when somebody presses the button.** The colophon promises
 * no analytics, no tracking and no third parties, and a background check
 * against GitHub would quietly make that untrue: an app that phones a server on
 * every launch tells that server how often you open it, from where. A check you
 * asked for is a different thing, and the row in Us says who it asks.
 */

/**
 * What this build is.
 *
 * Set by the release workflow from the tag it was built from. A build made any
 * other way says `dev`, which never compares as older than anything, so a local
 * build is never told to update itself.
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? 'dev';

const OWNER = 'krishn1301';
const REPO = 'twoends';

export interface Release {
  /** The tag, without the leading `v`. */
  version: string;
  /** Where the APK for it is. */
  url: string;
}

export type UpdateResult =
  { state: 'current' } | { state: 'newer'; release: Release } | { state: 'failed'; reason: string };

/** The APK is the only build that cannot update itself. */
export const canUpdate = (): boolean => Capacitor.isNativePlatform();

const clean = (tag: string): string => tag.trim().replace(/^v/i, '');

/**
 * Whether `candidate` is a later release than `mine`.
 *
 * Numeric segment by segment, so 1.0.10 beats 1.0.9 — a string compare gets
 * that backwards, and it is the first place a version check goes wrong. A
 * build with no version at all (`dev`, or a tag nobody parsed) is never older
 * than anything: telling somebody running a local build to go and download a
 * release would be worse than saying nothing.
 */
export function isNewer(candidate: string, mine: string): boolean {
  /*
    `Number('')` is 0, not NaN, so an empty segment sails through a NaN check
    and an empty version reads as 0.0.0 — which makes every release look newer
    than the build you are on. Found by the test rather than in review, which is
    the whole reason it has one.
  */
  const parts = (v: string): number[] | null => {
    const bits = clean(v).split('.');
    if (bits.some((bit) => bit === '')) return null;

    const numbers = bits.map(Number);
    return numbers.some(Number.isNaN) ? null : numbers;
  };

  const a = parts(candidate);
  const b = parts(mine);
  if (!a || !b) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Ask GitHub what the newest release is.
 *
 * Unauthenticated, which is rate limited per address and generous enough for a
 * button somebody presses. The download link is built from the tag rather than
 * read out of the assets, because `releases/latest/download/` is the stable URL
 * and the asset list is one more shape to get wrong.
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  try {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });

    if (!response.ok) {
      return {
        state: 'failed',
        reason:
          response.status === 403
            ? 'GitHub is rate limiting this address. Try again in an hour.'
            : `GitHub said ${response.status}.`,
      };
    }

    const body: unknown = await response.json();
    const tag =
      typeof body === 'object' && body !== null && 'tag_name' in body
        ? String((body as { tag_name: unknown }).tag_name)
        : '';

    if (!tag) return { state: 'failed', reason: 'GitHub did not name a release.' };

    if (!isNewer(tag, APP_VERSION)) return { state: 'current' };

    return {
      state: 'newer',
      release: {
        version: clean(tag),
        url: `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/TwoEnds.apk`,
      },
    };
  } catch {
    // Offline, or a network that refuses github.com. Neither is worth an
    // apology; the app works either way and this is the one thing in it that
    // needs the outside world.
    return { state: 'failed', reason: 'Could not reach GitHub. Check your connection.' };
  }
}
