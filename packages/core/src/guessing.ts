import { deckOrder, type MatchCard } from './cards.ts';

/**
 * Answering as the other person.
 *
 * The original game asks what *you* would pick. This asks what *they* would
 * pick, which is a different and better question: there is a right answer, you
 * find out whether you had it, and being wrong is the part worth talking about.
 *
 * Two things keep it from turning into a test somebody can fail.
 *
 * **Both directions on one screen.** A reveal shows how well you knew them *and*
 * how well they knew you. A number that only ever measures one of the two people
 * is a report card, and nobody wants one of those from their partner.
 *
 * **The score belongs to the round, not to the relationship.** Five cards, a
 * count, and then it is gone. There is no history, no average, no "you are
 * getting worse at this". `daily.ts` sets the standard the whole app is held to:
 * never shames, never counts what you did not do.
 */

/** Five. Long enough for a score to mean something, short enough to finish. */
export const ROUND = 5;

export interface GuessCard {
  id: string;
  /** A line above the two options. Null on the shipped deck, which is bare. */
  body: string | null;
  a: string;
  b: string;
  /**
   * Set when one partner wrote this about themselves. Their own answer is
   * already recorded, so a guess is answered the instant it is made — there is
   * nobody to wait for.
   */
  authorId: string | null;
  /**
   * Which game it was written for. `guess` is a card about its author; `match`
   * joins the daily this-or-that deck. Null on the shipped deck, which is
   * neither and both.
   */
  kind?: 'match' | 'guess' | null;
}

/** A shipped two-option card, widened to the shape above. */
export const fromDeck = (card: MatchCard): GuessCard => ({
  id: card.id,
  body: null,
  a: card.a,
  b: card.b,
  authorId: null,
  kind: null,
});

/**
 * The next few cards to be asked about.
 *
 * Written cards first, oldest first: one of them sat down and made it, and a
 * thing somebody made for you should not queue behind thirty stock cards.
 * Your own are skipped — you cannot guess an answer you supplied.
 *
 * Then the shipped deck, in the couple's own order. The seed is the couple id,
 * the same as the original game, so both phones walk the deck together rather
 * than playing two solitaires.
 *
 * `done` is every card you already have a row on, in either game. A card you
 * both answered has already shown you their choice, so there is nothing left to
 * guess — it is spent, and quietly skipping it is kinder than offering a
 * question whose answer is on the screen behind it.
 */
export function guessRound(input: {
  deck: readonly MatchCard[];
  written: readonly GuessCard[];
  seed: string;
  done: ReadonlySet<string>;
  myId: string;
  size?: number;
}): GuessCard[] {
  const size = input.size ?? ROUND;

  const theirs = input.written.filter(
    (card) => card.authorId !== input.myId && !input.done.has(card.id),
  );

  const deck = deckOrder(input.deck, input.seed)
    .filter((card) => !input.done.has(card.id))
    .map(fromDeck);

  return [...theirs, ...deck].slice(0, size);
}

/**
 * How many cards are left to ask about at all.
 *
 * The deck is finite and this game spends it faster than the original, because
 * a card is used up the moment either of you touches it. Saying so before it
 * runs out is the difference between "write one of your own" reading as an
 * invitation and reading as an error message.
 */
export const cardsLeft = (input: {
  deck: readonly MatchCard[];
  written: readonly GuessCard[];
  done: ReadonlySet<string>;
  myId: string;
}): number =>
  input.written.filter((c) => c.authorId !== input.myId && !input.done.has(c.id)).length +
  input.deck.filter((c) => !input.done.has(c.id)).length;

/**
 * What a score says out loud.
 *
 * Every branch had to survive being read by the person who scored it, on a
 * screen their partner is also looking at. "One out of five" is a fact; "you
 * barely know her" is a thing an app has no business saying to anybody.
 */
export function knowingLabel(right: number, asked: number, name: string): string {
  if (asked === 0) return `Nothing to go on yet`;
  if (right === asked) return asked === 1 ? `You knew them` : `You knew ${name} on every one`;
  if (right === 0) return `None of ${asked}, which is a conversation`;
  return `You knew ${name} on ${right} of ${asked}`;
}

/** The same, said about them. Kept beside its pair so the two stay symmetrical. */
export function knownLabel(right: number, asked: number, name: string): string {
  if (asked === 0) return `${name} has not guessed yet`;
  if (right === asked) return asked === 1 ? `They knew you` : `${name} knew you on every one`;
  if (right === 0) return `${name} got none of ${asked}`;
  return `${name} knew you on ${right} of ${asked}`;
}
