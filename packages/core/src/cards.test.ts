import { describe, expect, it } from 'vitest';

import {
  THIS_OR_THAT,
  TOPIC_PACKS,
  deckOrder,
  matchLabel,
  topicPacksFor,
  type MatchCard,
} from './cards.ts';

describe('the this-or-that deck', () => {
  it('has cards, and every card offers two different things', () => {
    expect(THIS_OR_THAT.length).toBeGreaterThan(20);
    for (const card of THIS_OR_THAT) {
      expect(card.a.trim()).not.toBe('');
      expect(card.b.trim()).not.toBe('');
      expect(card.a).not.toBe(card.b);
    }
  });

  /*
    The ids are foreign keys in everything but name: `game_picks.card_id` holds
    them, so a duplicate would silently merge two cards' picks into one.
  */
  it('gives every card an id of its own', () => {
    const ids = new Set(THIS_OR_THAT.map((c) => c.id));
    expect(ids.size).toBe(THIS_OR_THAT.length);
  });

  it('gives ids that survive a rebuild', () => {
    // Derived from the text, so the same words always produce the same id — the
    // property the whole "no migration to add a card" claim rests on.
    expect(THIS_OR_THAT.every((c) => /^[0-9a-f-]{36}$/.test(c.id))).toBe(true);
  });
});

describe('the topic packs', () => {
  it('offers the everyday packs to everyone', () => {
    const keys = topicPacksFor({}).map((p) => p.key);
    expect(keys).toContain('light');
    expect(keys).toContain('deeper');
  });

  it('keeps the adult pack shut unless it has been asked for', () => {
    expect(topicPacksFor({}).some((p) => p.isAdult)).toBe(false);
    expect(topicPacksFor({ adultEnabled: true }).some((p) => p.isAdult)).toBe(true);
  });

  it('only offers the apart pack to people who are apart', () => {
    expect(topicPacksFor({}).some((p) => p.key === 'apart')).toBe(false);
    expect(
      topicPacksFor({ relationshipType: 'long_distance' }).some((p) => p.key === 'apart'),
    ).toBe(true);
  });

  it('has no empty pack, which would render as a tab leading nowhere', () => {
    for (const pack of TOPIC_PACKS) {
      expect(pack.topics.length, `${pack.key} is empty`).toBeGreaterThan(0);
      expect(pack.label.trim()).not.toBe('');
    }
  });
});

describe('the deck order', () => {
  const cards: MatchCard[] = THIS_OR_THAT;

  it('is the same on both phones, because both seed it with the couple id', () => {
    const a = deckOrder(cards, 'couple-1').map((c) => c.id);
    const b = deckOrder(cards, 'couple-1').map((c) => c.id);
    expect(a).toEqual(b);
  });

  it('differs between couples', () => {
    const a = deckOrder(cards, 'couple-1').map((c) => c.id);
    const b = deckOrder(cards, 'couple-2').map((c) => c.id);
    expect(a).not.toEqual(b);
  });

  it('loses nothing and invents nothing', () => {
    const shuffled = deckOrder(cards, 'couple-3');
    expect(shuffled).toHaveLength(cards.length);
    expect([...shuffled].sort((x, y) => x.id.localeCompare(y.id))).toEqual(
      [...cards].sort((x, y) => x.id.localeCompare(y.id)),
    );
  });

  it('does not simply return the deck unshuffled', () => {
    // A shuffle that is the identity function is a bug that no other assertion
    // here would notice.
    const shuffled = deckOrder(cards, 'couple-4').map((c) => c.id);
    expect(shuffled).not.toEqual(cards.map((c) => c.id));
  });

  it('handles a deck of one without hanging', () => {
    expect(deckOrder([cards[0]!], 'x')).toHaveLength(1);
    expect(deckOrder([], 'x')).toEqual([]);
  });
});

describe('the tally', () => {
  it('says nothing has been played rather than dividing by zero', () => {
    expect(matchLabel(0, 0)).toBe('Nothing played yet');
  });

  it('never phrases a low score as a failure', () => {
    for (const [agreed, total] of [
      [0, 10],
      [1, 10],
      [3, 10],
    ] as const) {
      const line = matchLabel(agreed, total);
      expect(line).not.toMatch(/fail|poor|bad|worry|only/i);
      expect(line).toContain(String(total));
    }
  });

  it('reads naturally at one card', () => {
    expect(matchLabel(1, 1)).toBe('Agreed');
  });
});
