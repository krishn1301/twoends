import { coarsen, type Fix, type Precision } from '@twoends/core';

import { supabase } from '../lib/supabase.ts';

/**
 * Location, from the client's side.
 *
 * Three properties this module exists to guarantee, in order of how much they
 * matter:
 *
 *  1. **Foreground only.** There is no watcher, no background task and no
 *     service worker involvement. A position is read when someone opens the app
 *     and at no other time. This is the difference between a feature and a
 *     tracker, and it is why nothing here calls `watchPosition`.
 *  2. **Coarsened before it is sent.** The database rounds it again on the way
 *     in, but a precise coordinate should not travel at all if nobody asked for
 *     one — the network is a place data can be observed.
 *  3. **Off is off.** Turning it off writes `sharing = false`, and the trigger
 *     on that write erases the stored coordinate. It does not merely stop
 *     updating.
 *
 * Works identically in Mobile Safari, which is the point: the friends this app
 * is for are mostly on iPhones with no way to sideload the APK, so everything
 * except the home-screen widget has to be reachable from the PWA.
 */

export type LocationState =
  | 'unsupported'
  /** The browser or OS has refused, and asking again will not prompt. */
  | 'denied'
  | 'off'
  | 'on';

export interface Presence {
  mine: Fix | null;
  theirs: Fix | null;
  precision: Precision;
  /** My own switches, so the UI can render them without a second read. */
  sharing: boolean;
  wantsPrecise: boolean;
}

export const EMPTY_PRESENCE: Presence = {
  mine: null,
  theirs: null,
  precision: 'coarse',
  sharing: false,
  wantsPrecise: false,
};

export const locationSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'geolocation' in navigator;

/**
 * Whether asking would even produce a prompt.
 *
 * The Permissions API is the only way to tell "not asked yet" from "refused
 * once, silently refused forever", and Safari's support for the `geolocation`
 * name is recent and patchy. A throw is treated as "we cannot know", which
 * resolves to `off` — the state where the button is offered. Offering a button
 * that turns out to be blocked is a much smaller failure than hiding a button
 * that would have worked.
 */
export async function locationState(sharing: boolean): Promise<LocationState> {
  if (!locationSupported()) return 'unsupported';
  if (sharing) return 'on';

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state === 'denied' ? 'denied' : 'off';
  } catch {
    return 'off';
  }
}

/**
 * Reads a position, rounds it, and stores it.
 *
 * Called on turning it on and on every foreground after that, and it is the
 * only thing in the app that touches the geolocation API.
 */
export async function pushPosition(
  profileId: string,
  wantsPrecise: boolean,
): Promise<{ error: string | null }> {
  if (!locationSupported()) return { error: 'This browser cannot do location.' };

  let position: GeolocationPosition;
  try {
    position = await currentPosition(wantsPrecise);
  } catch (cause) {
    return { error: describe(cause) };
  }

  const raw = { lat: position.coords.latitude, lng: position.coords.longitude };

  /*
    Only send the precise coordinate when this person has asked for precise.
    Whether they *get* precise depends on the partner too, and that question is
    settled server-side — so the honest thing to send is the finest resolution
    this person has consented to, and let the trigger decide the rest.
  */
  const point = wantsPrecise ? raw : coarsen(raw);

  const { error } = await supabase.from('presence').upsert(
    {
      profile_id: profileId,
      sharing: true,
      wants_precise: wantsPrecise,
      lat: point.lat,
      lng: point.lng,
    },
    { onConflict: 'profile_id' },
  );

  return { error: error?.message ?? null };
}

/**
 * Stops sharing.
 *
 * An update rather than a delete: the row carries `wants_precise`, which is a
 * preference worth keeping so that turning it back on does not silently
 * downgrade an agreement the two of you already made. The trigger nulls the
 * coordinate, which is the part that matters.
 */
export async function stopSharing(profileId: string): Promise<void> {
  await supabase
    .from('presence')
    .upsert({ profile_id: profileId, sharing: false }, { onConflict: 'profile_id' });
}

/** Changes this person's answer to the precise question. Takes effect for both. */
export async function setWantsPrecise(profileId: string, wants: boolean): Promise<void> {
  await supabase
    .from('presence')
    .upsert({ profile_id: profileId, wants_precise: wants }, { onConflict: 'profile_id' });
}

/**
 * Both rows, in one read.
 *
 * Row-level security returns mine unconditionally and theirs only while they are
 * sharing, so "they turned it off" arrives here as an absent row rather than as
 * a flag this code has to remember to honour.
 */
export async function loadPresence(myId: string): Promise<Presence> {
  const { data, error } = await supabase
    .from('presence')
    .select('profile_id, lat, lng, precision, sharing, wants_precise, updated_at');

  if (error || !data) return EMPTY_PRESENCE;

  const mineRow = data.find((row) => row.profile_id === myId) ?? null;
  const theirsRow = data.find((row) => row.profile_id !== myId) ?? null;

  return {
    mine: toFix(mineRow),
    theirs: toFix(theirsRow),
    // Both rows always carry the same value — the trigger keeps them in step —
    // so either will do, and mine is the one guaranteed to be readable.
    precision: mineRow?.precision === 'precise' ? 'precise' : 'coarse',
    sharing: mineRow?.sharing === true,
    wantsPrecise: mineRow?.wants_precise === true,
  };
}

interface PresenceRow {
  lat: number | null;
  lng: number | null;
  updated_at: string;
}

const toFix = (row: PresenceRow | null): Fix | null =>
  row && row.lat != null && row.lng != null
    ? { lat: row.lat, lng: row.lng, updatedAt: row.updated_at }
    : null;

/**
 * `getCurrentPosition` as a promise, with limits chosen for a phone in a pocket.
 *
 * `maximumAge` lets a fix from the last few minutes count, so returning to the
 * app twice in a row does not wake the GPS twice. `enableHighAccuracy` is off
 * unless precise was asked for — it is the flag that turns the radio on, and
 * a city-sized grid does not need it.
 */
function currentPosition(precise: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: precise,
      timeout: 15_000,
      maximumAge: 300_000,
    });
  });
}

function describe(cause: unknown): string {
  const code = (cause as GeolocationPositionError | null)?.code;

  if (code === 1) {
    return 'Location is blocked for TwoEnds. You can allow it in your browser settings.';
  }
  /*
    Both of these say "check location is on for the phone", because that is the
    cause in practice and neither error code tells you so.

    Found on a real device: with the system location toggle off, Android's
    WebView does not report POSITION_UNAVAILABLE — it simply never calls back
    and the request times out. "Location took too long. Try again." was
    therefore shown to someone whose only problem was a switch, and trying again
    would have failed forever.
  */
  if (code === 2) {
    return 'Could not get a location fix. Check that Location is on for your phone, and try again outside or on Wi-Fi.';
  }
  if (code === 3) {
    return 'Location took too long. Check that Location is switched on for your phone, then try again.';
  }
  return 'Could not read your location.';
}
