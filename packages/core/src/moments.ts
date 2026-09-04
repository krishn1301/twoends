/**
 * Same thing, same time.
 *
 * Once a day a prompt opens for both of them at once — *the nearest window, your
 * left hand, whatever you are drinking* — and once one of them answers it, the
 * other has an hour. That is the whole design: a photograph taken because a
 * timer said so is a truer picture of an ordinary Tuesday than one taken
 * because it was worth photographing.
 *
 * **The clock starts on the first photograph, not on the hour.** It was twenty
 * minutes from the top of the hour, for both of them, and the first day it ran
 * for real it produced nothing: one took the picture inside the window, the
 * other opened the app later and the card had already deleted itself. A
 * deadline both people have to be looking at their phones to meet is a deadline
 * neither of them meets. The hour is the invitation — still derived, still the
 * same on both phones, still chosen by neither — and the sixty minutes belong
 * to whoever went second.
 *
 * **Nothing schedules this.** The hour is derived from the couple's id and the
 * date, exactly the way `promptForDay` derives the question, so both phones
 * agree without a server telling either of them. The scheduled function knows
 * the same arithmetic and only uses it to decide whether to send a push.
 *
 * The prompts are deliberately physical and deliberately dull. *What is in
 * front of you* is a good prompt; *how are you feeling* is not — the pairing
 * does the emotional work, and a prompt that asks for a feeling gets a
 * performance instead of a Tuesday.
 */

/**
 * How long the second person has, from the moment the first one takes theirs.
 *
 * An hour rather than twenty minutes because the clock now starts on somebody's
 * action rather than on the wall, and the person it applies to has to be given
 * time to notice it started — they get a notification, and a notification you
 * see on the way out of a meeting is worth nothing against twenty minutes.
 */
export const MOMENT_RUN_MS = 60 * 60 * 1000;

/**
 * The hours it may open in, in the couple's own day.
 *
 * Ten to nine at night. Wide enough that it is not predictable, narrow enough
 * that it never asks somebody to photograph their shoes at three in the
 * morning — which is the one outcome that would make this feel like an alarm
 * rather than a nudge.
 */
export const MOMENT_HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21] as const;

export const MOMENT_PROMPTS = [
  'The nearest window.',
  'Your left hand.',
  'Whatever you are drinking.',
  'The floor you are standing on.',
  'What is directly in front of you.',
  'The sky, wherever you are.',
  'Your shoes.',
  'The last thing you put down.',
  'Something blue within reach.',
  'The view if you turn around.',
  'What is on your wrist.',
  'The nearest door.',
  'Your feet.',
  'Whatever is making noise.',
  'The nearest plant, alive or not.',
  'What you are sitting on.',
  'The nearest light.',
  'Something you have had for years.',
  'The nearest handwriting.',
  'What is in your pocket.',
  'The ceiling.',
  'Whatever is charging.',
  'The nearest stranger, from behind.',
  'A corner of the room.',
  'What you last ate off.',
  'The nearest reflection.',
  'Something round.',
  'The nearest cable.',
  'What is on the wall.',
  'The nearest queue, or the empty space where one would be.',
  'Something you keep meaning to move.',
  'The nearest bit of weather.',
  'What is behind you, without looking first.',
  'Your screen, as it is right now.',
  'The nearest chair nobody is on.',
  'Something red.',
  'The nearest thing with a lid.',
  'What time it says on the nearest clock.',
  'The nearest bag.',
  'Whatever is closest to your left foot.',
] as const;

export interface Moment {
  /** Index into `MOMENT_PROMPTS`, which is also what the row stores. */
  index: number;
  prompt: string;
  /** The hour, in the couple's own timezone, that it opens. */
  hour: number;
}

/**
 * A stable 32-bit hash. The same one `daily.ts` and `cards.ts` use, because two
 * different hashes over the same couple id would put every derived thing in
 * step with each other by accident and then out of step after an edit.
 */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * Today's moment for this couple, or null if they are not a couple yet.
 *
 * Deterministic in both directions: two phones with the same couple id and the
 * same local date get the same prompt at the same hour, with nothing passing
 * between them. A server-assigned time would need a round trip before either
 * phone could show anything, and would be wrong for whichever of them opened
 * the app offline.
 */
export function momentForDay(coupleId: string, localDate: string): Moment | null {
  if (!coupleId || !localDate) return null;

  // Two separate draws from one hash rather than two hashes: the prompt and the
  // hour must not move together, or every couple whose prompt matches also
  // opens at the same minute.
  const seed = hash(`${coupleId}:${localDate}`);
  const index = seed % MOMENT_PROMPTS.length;
  const hour = MOMENT_HOURS[(seed >>> 8) % MOMENT_HOURS.length]!;

  return { index, prompt: MOMENT_PROMPTS[index]!, hour };
}

export type MomentState =
  /** The hour has not come round yet. */
  | 'before'
  /** Open, and neither of them has taken one. There is no clock running. */
  | 'waiting'
  /** Somebody has, and the other one's hour is counting down. */
  | 'running'
  /** The hour ran out. Nothing more can be taken today. */
  | 'closed';

/**
 * Where today's moment is.
 *
 * `minutes` is minutes past midnight in the couple's timezone — the caller
 * works that out, because this file has no business knowing about `Intl`.
 * `startedAt` is when the *first* of the two photographs was taken, in epoch
 * milliseconds, or null when neither of them has moved.
 *
 * A day where neither ever takes one stays `waiting` until the local date
 * rolls. That is deliberate and it is not the old bug wearing a new name:
 * there is no clock, so there is nothing to have missed, and the card is still
 * offering rather than scolding. What ends a moment is somebody starting it.
 */
export function momentState(
  moment: Moment,
  minutes: number,
  startedAt: number | null,
  now: number,
): MomentState {
  if (minutes < moment.hour * 60) return 'before';
  if (startedAt === null) return 'waiting';
  return now < startedAt + MOMENT_RUN_MS ? 'running' : 'closed';
}

/**
 * Whole minutes left of the hour. Zero once it has run out.
 *
 * Rounded up, so a countdown never says "0 minutes left" while it is still
 * possible to take one — a zero that is not a deadline is worse than no number.
 */
export function momentLeft(startedAt: number | null, now: number): number {
  if (startedAt === null) return 0;
  return Math.max(0, Math.ceil((startedAt + MOMENT_RUN_MS - now) / 60_000));
}

/** "opens at 4pm", for the hours before it does. */
export function momentOpensAt(moment: Moment): string {
  const hour = moment.hour % 12 === 0 ? 12 : moment.hour % 12;
  return `${hour}${moment.hour < 12 ? 'am' : 'pm'}`;
}
