/**
 * Which question today is, and whose day it is.
 *
 * All of this is pure and deterministic: both devices compute the same answer
 * from the same three inputs, with no server call. That is what lets the daily
 * question appear instantly, offline, on a phone that has not synced since
 * yesterday.
 */

export interface Prompt {
  id: string;
  body: string;
  pack: string;
  isAdult: boolean;
}

// ── the couple's day ─────────────────────────────────────────────────────────

/**
 * The calendar date in a given IANA timezone, as `YYYY-MM-DD`.
 *
 * `toISOString().slice(0, 10)` — the obvious version — is UTC, which is wrong
 * for everyone east of Greenwich after 5.30am and everyone west of it before
 * midnight. For an app whose entire loop is "one question per day", being a day
 * out is not a rounding error; it is the wrong question.
 *
 * `en-CA` because it formats as `YYYY-MM-DD` natively, which avoids parsing
 * month names back out of a localised string.
 */
export function localDateIn(timezone: string, at: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    // An unknown zone should not stop the day from turning over.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  }
}

/** This device's own zone, for storing on the couple at pairing. */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Whole days between two `YYYY-MM-DD` dates. Calendar arithmetic, no clocks. */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(...parts(from));
  const b = Date.UTC(...parts(to));
  return Math.round((b - a) / 86_400_000);
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Not an ISO date: ${iso}`);
  return [y, m - 1, d];
}

// ── which question ───────────────────────────────────────────────────────────

/**
 * A stable 32-bit hash of a string. Not cryptographic — it decides which
 * question you get, not who can read it.
 */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A deterministic id built from a namespace and a name.
 *
 * Both devices need to agree on the identity of "today's prompt day" while
 * offline, so the id cannot be random and cannot come from the server. Shaped
 * like a UUID so it drops straight into a `uuid` column.
 *
 * Not a real UUIDv5 — that needs SHA-1, which is async in browsers. The inputs
 * here are a couple id and a date, so the space is tiny and structured; four
 * independently seeded 32-bit hashes are ample.
 */
export function deterministicId(namespace: string, name: string): string {
  const seed = `${namespace}::${name}`;
  const a = hash(seed);
  const b = hash(`${seed}::1`);
  const c = hash(`${seed}::2`);
  const d = hash(`${seed}::3`);

  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const raw = `${hex(a)}${hex(b)}${hex(c)}${hex(d)}`;

  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    // Version 4 nibble and the RFC variant bits, so it is a well-formed UUID
    // even though it was not produced the way a v4 normally is.
    `4${raw.slice(13, 16)}`,
    `8${raw.slice(17, 20)}`,
    raw.slice(20, 32),
  ].join('-');
}

/**
 * Today's question.
 *
 * The pack is shuffled into a per-couple order, then walked one day at a time.
 * Picking by `hash(date) % length` instead would repeat questions within a
 * fortnight and occasionally twice in a week, which reads as the app not paying
 * attention. This way every prompt is used once before any is used twice, and
 * two couples starting the same day get different orders.
 */
export function promptForDay(
  coupleId: string,
  localDate: string,
  pack: readonly Prompt[],
): Prompt | null {
  if (pack.length === 0) return null;

  const order = shuffleFor(coupleId, pack);
  // Epoch is arbitrary but must be fixed: it anchors the walk through the pack.
  const day = daysBetween('2026-01-01', localDate);
  const index = ((day % order.length) + order.length) % order.length;

  return order[index] ?? null;
}

/** A stable permutation of the pack for one couple. Fisher-Yates, seeded. */
function shuffleFor(coupleId: string, pack: readonly Prompt[]): Prompt[] {
  const out = [...pack];
  let seed = hash(coupleId) || 1;

  const next = () => {
    // xorshift32: small, fast, and identical on every device.
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };

  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ── the state of today ───────────────────────────────────────────────────────

export type DayState =
  /** Neither of us has answered. */
  | 'open'
  /** They answered, you have not. The screen leans at you. */
  | 'your-move'
  /** You answered, they have not. */
  | 'waiting'
  /** Both answered; both answers are visible. */
  | 'revealed';

export function dayState(mine: boolean, theirs: boolean): DayState {
  if (mine && theirs) return 'revealed';
  if (theirs) return 'your-move';
  if (mine) return 'waiting';
  return 'open';
}

/** One line of copy per state. Never shames, never counts what you did not do. */
export function dayLabel(state: DayState, theirName: string): string {
  switch (state) {
    case 'open':
      return 'Nobody has answered yet';
    case 'your-move':
      return `${theirName} answered`;
    case 'waiting':
      return `Waiting for ${theirName}`;
    case 'revealed':
      return 'Both answered';
  }
}
