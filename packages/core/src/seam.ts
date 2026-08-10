import type { PromptDay } from './types.ts';

/**
 * The seam is the app's signature: one soft diagonal where the two accents meet.
 * Its position is data, not decoration — it sits centred when the pair is even
 * and slides toward whoever the app is waiting on. "Your move" stops being a
 * button and becomes the whole screen leaning at you.
 */

export type Turn =
  /** They have answered, I have not. The screen leans at me. */
  | 'mine'
  /** I have answered, they have not. */
  | 'theirs'
  /** Neither of us has answered yet. */
  | 'both'
  /** Both answered — today is done. */
  | 'settled'
  /** No partner yet. The solo state, and it must still look intentional. */
  | 'solo';

export function turnFor(prompt: PromptDay | null, hasPartner: boolean): Turn {
  if (!hasPartner) return 'solo';
  if (!prompt) return 'both';
  const mine = prompt.myAnswer !== null;
  const theirs = prompt.theyHaveAnswered;
  if (mine && theirs) return 'settled';
  if (theirs) return 'mine';
  if (mine) return 'theirs';
  return 'both';
}

/**
 * Fraction of the surface given to *my* colour, 0 to 1.
 *
 * The lean is deliberately gentle. A 68/32 split reads as "leaning" at a glance;
 * anything stronger reads as an error state, and this screen is shown every day.
 */
export function seamPosition(turn: Turn): number {
  switch (turn) {
    case 'mine':
      return 0.68;
    case 'theirs':
      return 0.32;
    case 'both':
    case 'settled':
      return 0.5;
    case 'solo':
      return 1;
  }
}

/** One line of copy per turn. Active voice, sentence case, no pet names. */
export function turnLabel(turn: Turn, theirName: string): string {
  switch (turn) {
    case 'mine':
      return 'Your move';
    case 'theirs':
      return `Waiting on ${theirName}`;
    case 'both':
      return "Today's question is open";
    case 'settled':
      return 'Both answered';
    case 'solo':
      return 'Just you, for now';
  }
}
