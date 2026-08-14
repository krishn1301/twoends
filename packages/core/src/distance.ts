/**
 * How far apart the two of you are.
 *
 * Pure, like everything in this package: it takes two coordinates and a clock
 * reading and returns words. No geolocation API, no network, no storage — the
 * app layer supplies the numbers and this decides what they mean.
 *
 * The reason the *words* live here rather than in a component is that three
 * surfaces have to agree on them: the Home screen, the Us screen, and an Android
 * widget written in Kotlin that is deliberately not allowed to compute anything.
 * If the phrasing lived in the UI, the widget would need its own copy of these
 * rules in another language, and the two would drift.
 *
 * See docs/PRIVACY.md. The short version: a distance is shared, a position never
 * is, and "city-level" is enforced by the database rather than by this file.
 */

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface Fix extends Coordinate {
  /** ISO timestamp of when this position was recorded. */
  updatedAt: string;
}

export type Precision = 'coarse' | 'precise';

/**
 * Mean Earth radius, the IUGG figure.
 *
 * Haversine assumes a sphere, and the Earth is 21 km wider at the equator than
 * it is tall. Over the distances a couple is apart that is a fraction of a
 * percent — far inside the ~15 km of noise the coarse grid already introduces —
 * so the extra machinery of an ellipsoidal formula would buy precision the data
 * does not have.
 */
export const EARTH_RADIUS_KM = 6371.0088;

/**
 * The city-sized grid, in degrees. Must match `coarse_grid()` in
 * `supabase/migrations/00000000000013_location.sql` — the database is what
 * enforces it; this is what lets the client avoid sending anything finer in the
 * first place.
 */
export const COARSE_GRID_DEG = 0.1;

/**
 * Below this, a coarse reading is noise.
 *
 * Rounding each coordinate to the nearest tenth of a degree moves each person by
 * up to ~7.9 km — half a cell on each axis, worst at the equator where a degree
 * of longitude is longest — so two people standing together can compute up to
 * 15.73 km apart. Printing that as a number would be a lie told to four
 * significant figures; the app says "same city" instead, which is the most the
 * grid can support and happens to be what someone actually wants to know.
 *
 * The figure is 16 rather than 15 because the test derives the worst case from
 * `haversineKm` rather than trusting the arithmetic in this comment, and 15 did
 * not clear it.
 */
export const COARSE_NOISE_KM = 16;

/** Precise mode has no such floor — under this, you are in the same room. */
export const SAME_PLACE_KM = 0.12;

/**
 * A position older than this is not where they are.
 *
 * Location is foreground-only by design: nothing runs in the background, so the
 * fix is only as fresh as the last time they opened the app. Three days is long
 * enough to survive a weekend away from the phone and short enough that a widget
 * never quietly asserts someone is somewhere they left on Monday.
 */
export const STALE_AFTER_MS = 3 * 86_400_000;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function haversineKm(a: Coordinate, b: Coordinate): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  // `min(1, …)` guards the domain of asin: floating point can push h a hair
  // past 1 for antipodal points, and Math.sqrt of that is fine but asin is NaN.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Snaps a coordinate to the city grid.
 *
 * Applied on the device before anything is sent, so a precise position never
 * leaves the phone unless both people asked for that. The trigger in the
 * database does the same thing again — this is the polite half, that is the
 * enforced half.
 */
export function coarsen(point: Coordinate, grid: number = COARSE_GRID_DEG): Coordinate {
  return {
    lat: Math.round(point.lat / grid) * grid,
    lng: Math.round(point.lng / grid) * grid,
  };
}

/**
 * `since` is how old the *older* of the two fixes is, in words.
 *
 * It exists because location here is foreground-only: a reading is only as
 * fresh as the last time one of you opened the app. On Android a widget makes
 * that obvious — it visibly stops changing. On the PWA, which is all an iPhone
 * gets, there is nothing to notice, so the screen has to say it. A distance
 * with no age on it silently claims to be current.
 */
export type Reading =
  /** Neither of you has turned it on, or only one of you has. */
  | { kind: 'off'; label: string; note: string; km: null; since: null }
  /** On, but nobody has opened the app recently enough to trust the fix. */
  | { kind: 'stale'; label: string; note: string; km: null; since: string }
  /** Close enough that the grid cannot tell you apart. */
  | { kind: 'near'; label: string; note: string; km: number; since: string }
  | { kind: 'apart'; label: string; note: string; km: number; since: string };

export interface DistanceInput {
  mine: Fix | null;
  theirs: Fix | null;
  precision: Precision;
  /** Their display name, for the second line. Falls back to "them". */
  theirName?: string;
  nowMs: number;
}

/**
 * The one function every surface calls.
 *
 * Returns a `label` (the big text) and a `note` (the small one) already written,
 * because the alternative is each surface doing its own rounding and the widget
 * disagreeing with the screen that pushed data to it.
 */
export function readDistance(input: DistanceInput): Reading {
  const { mine, theirs, precision, nowMs } = input;
  const them = input.theirName?.trim() || 'them';

  if (!mine || !theirs) {
    return {
      kind: 'off',
      label: '—',
      note: mine ? `${them} hasn't turned it on` : 'Turn on location to see this',
      km: null,
      since: null,
    };
  }

  // The older of the two, because the reading is only as trustworthy as its
  // worse half. Saying "2 minutes ago" when one side last checked in on Tuesday
  // would be the most misleading thing this function could do.
  const age = Math.max(ageMs(mine, nowMs), ageMs(theirs, nowMs));
  const since = describeAge(age);

  if (age > STALE_AFTER_MS) {
    return { kind: 'stale', label: '—', note: 'No recent location', km: null, since };
  }

  const km = haversineKm(mine, theirs);

  if (precision === 'precise' && km < SAME_PLACE_KM) {
    return { kind: 'near', label: 'here', note: `Same place as ${them}`, km, since };
  }

  if (precision === 'coarse' && km < COARSE_NOISE_KM) {
    return { kind: 'near', label: 'same city', note: `Somewhere near ${them}`, km, since };
  }

  return { kind: 'apart', label: formatKm(km, precision), note: `km from ${them}`, km, since };
}

/**
 * The reading as one line, for a surface with no room for two.
 *
 * `readDistance` splits the answer across `label` and `note` because Home wants
 * a badge with a number in it and a sentence beside it. A widget wants the whole
 * thing in one heading — "870 km", not "870" over "km from Aanya" — and joining
 * those two strings in Kotlin would put the phrasing in a second language, which
 * is the one thing this module exists to prevent.
 *
 * Still no coordinate and still no raw figure: this is `label` with its unit
 * reattached, which is exactly the information `label` already carried.
 */
export function distanceHeadline(reading: Reading): string {
  if (reading.kind === 'apart') return `${reading.label} km`;
  if (reading.kind === 'near') return reading.label;
  return '—';
}

/**
 * Age in words, rounded down and deliberately vague.
 *
 * Down rather than to nearest, so nothing is ever claimed to be fresher than it
 * is. Vague because the exact minute a partner last opened the app is a "last
 * seen" timestamp by another name, and docs/PRIVACY.md rules those out — the
 * point here is "can I trust this number", not surveillance of the other person.
 */
export function describeAge(ms: number): string {
  if (!Number.isFinite(ms)) return 'a long time ago';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/**
 * How many kilometres, said to the accuracy the data actually has.
 *
 * A coarse fix carries ~15 km of grid noise, so it is rounded to the nearest ten
 * — and past two hundred, to the nearest fifty, because the difference between
 * 1,240 and 1,270 km is not a difference anyone feels. A precise fix earns a
 * decimal, but only under ten kilometres.
 */
export function formatKm(km: number, precision: Precision = 'coarse'): string {
  if (precision === 'precise') {
    return km < 10 ? km.toFixed(1) : String(Math.round(km));
  }
  const step = km < 200 ? 10 : 50;
  return String(Math.round(km / step) * step);
}

const ageMs = (fix: Fix, nowMs: number): number => {
  const at = Date.parse(fix.updatedAt);
  // An unparseable timestamp is treated as ancient rather than as now. The
  // failure mode of the other choice is asserting a position that may be a year
  // old, which is the one thing this feature must not do.
  return Number.isNaN(at) ? Number.POSITIVE_INFINITY : nowMs - at;
};
