import raw from '../content/cards.json' with { type: 'json' };

import { daysBetween, deterministicId } from './daily.ts';

/**
 * The game, and the things to talk about.
 *
 * Both reference apps put a games section behind the paywall — candle's reads
 * "unlock all questions, widgets, games" — which is why this exists at all: it
 * is the most obviously withheld thing in the category, and it costs nothing to
 * give away.
 *
 * Two shapes, and they are deliberately different from the daily question:
 *
 *  - **this or that** is a *choice*, not an answer. There is nothing to write,
 *    which means it survives the evening when neither of you has the energy to
 *    compose a paragraph. It still waits for both of you, because a game where
 *    you can see their pick before making your own is a quiz you take alone.
 *
 *  - **topics** are subjects rather than questions, and nothing about them is
 *    stored. They are meant to be read out on a call and then talked about,
 *    which is the one thing this whole app is ultimately for. Recording an
 *    answer would turn a conversation into homework.
 *
 * Ids come from the text, so the deck can be reordered, extended or reworded
 * without a migration and without a couple's history pointing at the wrong card.
 * Editing a card's words makes a new card rather than silently rewriting a
 * choice two people already made — the same rule the prompt packs follow.
 */

interface CardFile {
  version: number;
  thisOrThat: { a: string; b: string }[];
  thisOrThatAdult: { a: string; b: string }[];
  topics: Record<string, { label: string; isAdult: boolean; topics: string[] }>;
}

const file = raw as CardFile;

export const CARD_PACK_VERSION = file.version;

export interface MatchCard {
  /** Stable, derived from both options. Stored as `game_picks.card_id`. */
  id: string;
  a: string;
  b: string;
}

/** Which side someone picked. Stored as 0 or 1, matching `a` and `b`. */
export type Side = 0 | 1;

const toCard = (card: { a: string; b: string }): MatchCard => ({
  id: deterministicId('twoends.card', `${card.a}|${card.b}`),
  a: card.a,
  b: card.b,
});

export const THIS_OR_THAT: MatchCard[] = file.thisOrThat.map(toCard);

/**
 * The 18+ half of the deck.
 *
 * A separate list rather than a flag on each card, so that the ordinary export
 * cannot accidentally include them and nothing has to remember to filter. Off
 * until both people have asked for it — see `matchCardsFor`.
 */
export const THIS_OR_THAT_ADULT: MatchCard[] = file.thisOrThatAdult.map(toCard);

/**
 * The cards a given couple should be dealt.
 *
 * Turning the 18+ packs on used to change the daily question and add a topic
 * pack, and left both card games exactly as they were — which meant half of what
 * it unlocked was invisible, and the half you could see was in the one mode that
 * stores nothing.
 *
 * **Adding cards reshuffles the deck**, because the order is a seeded shuffle of
 * whatever list it is given. Nothing is lost by that: a pick is stored against
 * the card's own id, so cards already played stay played and the screen still
 * opens on the first one nobody has answered. It does mean the card *after* the
 * one you were on will be a different card, which is the honest cost of the
 * deck getting bigger.
 */
export function matchCardsFor(options: { adultEnabled?: boolean }): MatchCard[] {
  return options.adultEnabled === true ? [...THIS_OR_THAT, ...THIS_OR_THAT_ADULT] : THIS_OR_THAT;
}

export interface TopicPack {
  key: string;
  label: string;
  isAdult: boolean;
  topics: string[];
}

export const TOPIC_PACKS: TopicPack[] = Object.entries(file.topics).map(([key, pack]) => ({
  key,
  label: pack.label,
  isAdult: pack.isAdult,
  topics: pack.topics,
}));

/**
 * The packs a given couple should be offered.
 *
 * The same two rules the prompt packs use, for the same two reasons: the adult
 * pack is off until both people have asked for it, and "which hour of the day
 * is hardest" is a strange thing to hand someone who is sitting next to you.
 */
export function topicPacksFor(options: {
  relationshipType?: string | null;
  adultEnabled?: boolean;
}): TopicPack[] {
  return TOPIC_PACKS.filter((pack) => {
    if (pack.isAdult) return options.adultEnabled === true;
    if (pack.key === 'apart') return options.relationshipType === 'long_distance';
    return true;
  });
}

/**
 * A per-couple order for the deck, walked one card at a time.
 *
 * Same shuffle as the daily question, and for the same reason: picking at
 * random each time repeats cards long before the deck is spent, and a fixed
 * order means every couple using the app sees the same card on the same
 * evening. The seed is the couple id, so both phones agree without talking to
 * each other.
 */
export function deckOrder<T>(cards: readonly T[], seed: string): T[] {
  const ordered = [...cards];

  /*
    Fisher-Yates driven by a seeded generator rather than Math.random, so the
    two devices produce the same deck. `hashSeed` is xmur3; the generator is
    mulberry32 — small, fast, and good enough for shuffling a deck of thirty.
  */
  const next = mulberry32(hashSeed(seed));
  for (let i = ordered.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [ordered[i], ordered[j]] = [ordered[j]!, ordered[i]!];
  }
  return ordered;
}

function hashSeed(text: string): number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How the tally is phrased.
 *
 * In core because Play and — one day — a widget both have to say it, and
 * because the wording carries a judgement worth keeping in one place: a low
 * score is never "you failed". Two people who disagree about everything and
 * stayed anyway is a better story than two people who match on beaches.
 */
export function matchLabel(agreed: number, total: number): string {
  if (total === 0) return 'Nothing played yet';
  const share = agreed / total;
  if (share === 1) return total === 1 ? 'Agreed' : 'Agreed on all of them';
  if (share >= 0.7) return `Same answer ${agreed} times out of ${total}`;
  if (share >= 0.35) return `${agreed} of ${total} the same, which is most couples`;
  if (agreed === 0) return `Nothing in common across ${total}, and still here`;
  return `${agreed} of ${total} the same, and still here`;
}

// ── one card a day ───────────────────────────────────────────────────────────

export interface DailyCard {
  card: MatchCard;
  /**
   * How many times the deck has been all the way round. Zero the first time
   * through; one or more means this card has been here before, and the screen
   * should say so rather than quietly showing an old answer.
   */
  cycle: number;
  /** Where in the deck today falls, for "12 of 48". */
  position: number;
  size: number;
}

/**
 * Today's card.
 *
 * This or that used to be a deck you walked with Back and Next, which meant it
 * was a thing you could *finish* — one evening, and then a tally that never grew
 * again. For an app whose whole premise is that you come back tomorrow, a game
 * you complete is a game that stops working.
 *
 * So: the same shape as `promptForDay`, which has served one question a day
 * since Phase 4 and never once run out. A seeded shuffle keyed on the couple id,
 * a walk indexed by the date, and a modulo that brings it round again. Both
 * phones compute the same card for the same day without talking to each other.
 *
 * **Coming round is a feature and not a fallback.** Forty-eight cards is seven
 * weeks; after that a card returns, and what makes the second pass worth having
 * is seeing what you each said the first time. `cycle` is how the screen knows
 * to say so.
 */
export function cardForDay(
  coupleId: string,
  localDate: string,
  deck: readonly MatchCard[],
): DailyCard | null {
  if (deck.length === 0) return null;

  const order = deckOrder(deck, coupleId);

  /*
    The same fixed epoch `promptForDay` uses. Arbitrary, and it must never move:
    it anchors the walk, so changing it would hand every couple a different card
    tomorrow and make every "you said this in July" point at the wrong card.
  */
  const day = daysBetween('2026-01-01', localDate);
  const size = order.length;

  // Floor division rather than truncation, so a date before the epoch walks
  // backwards rather than reflecting around zero.
  const position = ((day % size) + size) % size;
  const cycle = Math.floor(day / size);

  const card = order[position];
  if (!card) return null;

  return { card, cycle: Math.max(0, cycle), position, size };
}
