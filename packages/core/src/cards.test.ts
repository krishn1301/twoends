import { describe, expect, it } from 'vitest';

import {
  THIS_OR_THAT,
  THIS_OR_THAT_ADULT,
  TOPIC_PACKS,
  cardForDay,
  matchCardsFor,
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

describe('the 18+ half of the deck', () => {
  it('is off unless both of them asked for it', () => {
    expect(matchCardsFor({})).toEqual(THIS_OR_THAT);
    expect(matchCardsFor({ adultEnabled: false })).toEqual(THIS_OR_THAT);
    expect(matchCardsFor({ adultEnabled: undefined })).toEqual(THIS_OR_THAT);
  });

  it('adds cards rather than replacing them when it is on', () => {
    const all = matchCardsFor({ adultEnabled: true });
    expect(all.length).toBe(THIS_OR_THAT.length + THIS_OR_THAT_ADULT.length);
    for (const card of THIS_OR_THAT) expect(all).toContainEqual(card);
  });

  it('keeps every id distinct across both halves', () => {
    // Ids come from the words, so a card written twice would silently share a
    // row with its twin and one couple's pick would answer for the other.
    const all = matchCardsFor({ adultEnabled: true });
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
  });

  it('never leaks an adult card into the ordinary deck', () => {
    /*
      A separate list rather than a flag per card, so this cannot happen by
      forgetting a filter. Asserted anyway, because the failure would be
      somebody being shown 18+ content they never agreed to.
    */
    const ordinary = new Set(THIS_OR_THAT.map((c) => c.id));
    for (const card of THIS_OR_THAT_ADULT) {
      expect(ordinary.has(card.id), `${card.a} / ${card.b} is in the open deck`).toBe(false);
    }
  });
});

describe('one card a day', () => {
  const deck = THIS_OR_THAT;

  it('gives both phones the same card on the same day', () => {
    // The only thing that makes it a game they play together rather than two
    // solitaires. Neither device asks the other.
    const a = cardForDay('couple-1', '2026-08-20', deck);
    const b = cardForDay('couple-1', '2026-08-20', deck);
    expect(a?.card.id).toBe(b?.card.id);
  });

  it('gives different couples different cards', () => {
    expect(cardForDay('couple-1', '2026-08-20', deck)?.card.id).not.toBe(
      cardForDay('couple-2', '2026-08-20', deck)?.card.id,
    );
  });

  it('moves on tomorrow', () => {
    expect(cardForDay('couple-1', '2026-08-20', deck)?.card.id).not.toBe(
      cardForDay('couple-1', '2026-08-21', deck)?.card.id,
    );
  });

  it('walks the whole deck before repeating anything', () => {
    /*
      The property that makes "came round again" mean something. If the walk
      repeated early, the second-pass copy would be a lie about a card you saw
      last week.
    */
    const seen = new Set<string>();
    for (let i = 0; i < deck.length; i++) {
      const day = new Date(Date.UTC(2026, 7, 20) + i * 86_400_000).toISOString().slice(0, 10);
      seen.add(cardForDay('couple-1', day, deck)!.card.id);
    }

    // Any run of `deck.length` days, wherever it starts, covers the deck exactly
    // once. Starting mid-deck crosses into the next cycle partway through, which
    // is correct and is why this asserts coverage rather than a fixed cycle.
    expect(seen.size).toBe(deck.length);
  });

  it('raises the cycle only once the deck is spent', () => {
    const first = cardForDay('couple-1', '2026-01-01', deck)!;
    expect(first.cycle).toBe(0);

    const dayAfterTheDeck = new Date(Date.UTC(2026, 0, 1) + deck.length * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const second = cardForDay('couple-1', dayAfterTheDeck, deck)!;

    expect(second.cycle).toBe(1);
    expect(second.card.id, 'the second pass should start where the first did').toBe(first.card.id);
  });

  it('never divides by zero', () => {
    expect(cardForDay('couple-1', '2026-08-20', [])).toBeNull();
    expect(cardForDay('couple-1', '2026-08-20', deck.slice(0, 1))?.card.id).toBe(deck[0]!.id);
  });

  it('does not go backwards before the epoch', () => {
    // A couple whose device clock is wrong, or a date typed by a test. It must
    // hand back a real card rather than a negative index.
    const early = cardForDay('couple-1', '2025-06-01', deck);
    expect(early).not.toBeNull();
    expect(early!.position).toBeGreaterThanOrEqual(0);
    expect(early!.position).toBeLessThan(deck.length);
    expect(early!.cycle).toBe(0);
  });

  it('gets longer when the 18+ cards are on', () => {
    const open = cardForDay('couple-1', '2026-08-20', matchCardsFor({}))!;
    const all = cardForDay('couple-1', '2026-08-20', matchCardsFor({ adultEnabled: true }))!;
    expect(all.size).toBeGreaterThan(open.size);
  });
});
