import raw from '../content/dedication.json' with { type: 'json' };

import { deterministicId, type Prompt } from './daily.ts';

/**
 * The words, and who is allowed to see them.
 *
 * This app was built for one person and then opened up to a few friends. That
 * makes three different audiences on one screen, and confusing them is the only
 * way this feature can really go wrong:
 *
 *  - **The signature** is for everybody. A book carries its dedication on the
 *    flyleaf where every reader sees it; that is the point of a dedication.
 *  - **The occasions** are for everybody too, but written so they read as the
 *    reader's own — their names, their date, their years. Nothing in them is
 *    about one particular couple.
 *  - **`hers`** is for one person, or for the couple she is half of. Which of
 *    those two applies is not a preference — see `herPrompts` below, where
 *    getting it wrong breaks the daily question for both of them.
 *
 * Every string lives in `content/dedication.json` rather than inline, so the
 * person who has to write them can find all of them at once and does not have to
 * read TypeScript to do it.
 */

interface DedicationFile {
  version: number;
  note: string;
  signature: { mark: string; line: string; year: string };
  colophon: {
    title: string;
    opening: string;
    promises: Array<{ title: string; body: string }>;
  };
  occasions: Record<string, { eyebrow?: string; line: string }>;
  counter: { held: string };
  hers: { note: string; line: string; questions: string[] };
}

const file = raw as DedicationFile;

export const SIGNATURE = file.signature;
export const COLOPHON = file.colophon;

/** Anything still saying this has not been written, and must not ship. */
export const UNWRITTEN = 'TODO';

export const isWritten = (text: string): boolean => !text.trim().startsWith(UNWRITTEN);

/**
 * The line for an occasion, or null if it has not been written yet.
 *
 * Null rather than a placeholder on purpose. A card that appears on somebody's
 * anniversary saying "TODO" is worse than no card, and the whole point of a
 * once-a-year moment is that there is no second chance to get it right.
 */
export function occasionCopy(kind: string): { eyebrow?: string; line: string } | null {
  const entry = file.occasions[kind];
  if (!entry || !isWritten(entry.line)) return null;
  return entry;
}

/** What the anniversary counter says when held, or null while unwritten. */
export function heldCopy(): string | null {
  return isWritten(file.counter.held) ? file.counter.held : null;
}

// ── one person ───────────────────────────────────────────────────────────────

/**
 * Whose eyes the private layer is for, as a hash rather than an id.
 *
 * **This is obfuscation, not secrecy, and it matters that nobody mistakes it for
 * the latter.** `deterministicId` is four 32-bit hashes, not a cipher: anybody
 * holding this repository and a profile id can compute the same value in a
 * second and confirm a match. It is here for one reason only — so the source of
 * a public repository does not contain a line that reads "if user 20a5cf9c is
 * looking, show them this".
 *
 * The actual boundary, as everywhere else in this project, is row-level
 * security. Nothing behind this check is secret; it is merely addressed.
 *
 * `packages/core/test/dedication-source.test.ts` asserts this constant really is
 * her and really is not him. Without that it is a string nobody can read, which
 * means a mistyped character fails silently and permanently.
 */
const HERS = 'af93ca33-cb66-46f6-8a66-5563c96653d0';

/** True when the person reading is the one this was written for. */
export const isHer = (profileId: string | null | undefined): boolean =>
  profileId != null && deterministicId('twoends.dedication', profileId) === HERS;

/** The one sentence only she ever sees, or null while unwritten. */
export const herLine = (): string | null => (isWritten(file.hers.line) ? file.hers.line : null);

// ── her couple ───────────────────────────────────────────────────────────────

/**
 * True when this couple is the one the app was written for.
 *
 * Takes both member ids rather than the reader's own, and that is the whole
 * point. The daily question is derived from `(couple id, local date)` against a
 * *list of prompts*, so the list has to be identical on both phones — feed one
 * of them three extra questions and the two of them get different questions on
 * the same morning, and the reveal that is the entire feature stops working.
 *
 * So: gated on the couple, computed from the couple row, which both devices
 * already have. Not on the reader.
 */
export const isHerCouple = (memberA?: string | null, memberB?: string | null): boolean =>
  isHer(memberA) || isHer(memberB);

/**
 * The questions written for one couple, folded in among the ordinary ones.
 *
 * Bundle-only rather than seeded, deliberately. `scripts/seed-prompts.mjs`
 * writes `prompts.json` into Postgres with a null `couple_id`, and migration 11
 * makes every such row readable by *any* signed-in user — so seeding a hidden
 * pack that way publishes it to everybody with an account. These stay in the
 * bundle and are filtered on the client, which is honest about what this layer
 * is: not obvious, rather than unreadable. They ride along in everyone's
 * JavaScript. Anything that genuinely must not be read has to be a row behind a
 * policy, and a question is not that.
 *
 * The consequence lives in `apps/web/src/db/daily.ts`: an unseeded prompt has no
 * row for `prompt_days.prompt_id` to reference, so answering one has to create
 * it first. See the note there.
 */
export const HER_PACK = 'hers';

export const herPrompts = (): Prompt[] =>
  file.hers.questions.filter(isWritten).map((body) => ({
    id: deterministicId('twoends.prompt', body),
    body,
    pack: HER_PACK,
    isAdult: false,
  }));
