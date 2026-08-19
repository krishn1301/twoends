import { describe, expect, it } from 'vitest';

import { THIS_OR_THAT } from './cards.ts';
import { ROUND, cardsLeft, guessRound, knowingLabel, knownLabel } from './guessing.ts';

const ME = 'me';
const THEM = 'them';

const written = (id: string, authorId: string) => ({
  id,
  body: `question ${id}`,
  a: 'one',
  b: 'the other',
  authorId,
});

const round = (over: Partial<Parameters<typeof guessRound>[0]> = {}) =>
  guessRound({
    deck: THIS_OR_THAT,
    written: [],
    seed: 'couple-1',
    done: new Set<string>(),
    myId: ME,
    ...over,
  });

describe('what a round is made of', () => {
  it('deals five', () => {
    expect(round()).toHaveLength(ROUND);
  });

  it('puts what they wrote before anything off the shelf', () => {
    // One of them sat down and made it. It should not queue behind thirty
    // stock cards nobody wrote for anybody.
    const cards = round({ written: [written('w1', THEM)] });
    expect(cards[0]?.id).toBe('w1');
    expect(cards).toHaveLength(ROUND);
  });

  it('never asks you to guess your own answer', () => {
    const cards = round({ written: [written('mine', ME), written('theirs', THEM)] });
    expect(cards.map((c) => c.id)).toContain('theirs');
    expect(cards.map((c) => c.id)).not.toContain('mine');
  });

  it('skips a card either of you has already touched', () => {
    /*
      A card you both answered in the original game has already shown you their
      choice, so there is nothing left to guess. Offering it would put the
      answer on the screen behind the question.
    */
    const first = round();
    const done = new Set([first[0]!.id, first[1]!.id]);
    const next = round({ done });

    expect(next.map((c) => c.id)).not.toContain(first[0]!.id);
    expect(next.map((c) => c.id)).not.toContain(first[1]!.id);
    expect(next[0]?.id).toBe(first[2]!.id);
  });

  it('deals the same cards to both phones', () => {
    // The seed is the couple id, so this is the one thing that makes it a game
    // they play together rather than two solitaires.
    const mine = guessRound({
      deck: THIS_OR_THAT,
      written: [],
      seed: 'couple-1',
      done: new Set(),
      myId: ME,
    });
    const theirs = guessRound({
      deck: THIS_OR_THAT,
      written: [],
      seed: 'couple-1',
      done: new Set(),
      myId: THEM,
    });
    expect(mine.map((c) => c.id)).toEqual(theirs.map((c) => c.id));
  });

  it('gives different couples different orders', () => {
    const a = round({ seed: 'couple-1' }).map((c) => c.id);
    const b = round({ seed: 'couple-2' }).map((c) => c.id);
    expect(a).not.toEqual(b);
  });

  it('hands back a short round rather than repeating, when the deck runs low', () => {
    const done = new Set(THIS_OR_THAT.slice(0, THIS_OR_THAT.length - 2).map((c) => c.id));
    const cards = round({ done });
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((c) => c.id)).size).toBe(2);
  });

  it('runs out rather than looping forever', () => {
    const done = new Set(THIS_OR_THAT.map((c) => c.id));
    expect(round({ done })).toEqual([]);
  });
});

describe('how many are left', () => {
  it('counts the deck and their written ones, and not your own', () => {
    const done = new Set<string>();
    expect(cardsLeft({ deck: THIS_OR_THAT, written: [], done, myId: ME })).toBe(
      THIS_OR_THAT.length,
    );
    expect(
      cardsLeft({
        deck: THIS_OR_THAT,
        written: [written('mine', ME), written('theirs', THEM)],
        done,
        myId: ME,
      }),
    ).toBe(THIS_OR_THAT.length + 1);
  });

  it('drops as cards are spent', () => {
    const done = new Set(THIS_OR_THAT.slice(0, 5).map((c) => c.id));
    expect(cardsLeft({ deck: THIS_OR_THAT, written: [], done, myId: ME })).toBe(
      THIS_OR_THAT.length - 5,
    );
  });
});

describe('what the score is allowed to say', () => {
  /*
    Every branch has to survive being read by the person who scored it, on a
    screen their partner is also looking at. A number is a fact; a verdict is a
    thing an app has no business handing to somebody about their relationship.
  */
  it('never uses a word that reads as a verdict', () => {
    const forbidden = /fail|poor|bad|wrong|worse|barely|hardly|should/i;
    for (let asked = 0; asked <= 5; asked++) {
      for (let right = 0; right <= asked; right++) {
        expect(knowingLabel(right, asked, 'Sansu'), `${right}/${asked}`).not.toMatch(forbidden);
        expect(knownLabel(right, asked, 'Sansu'), `${right}/${asked}`).not.toMatch(forbidden);
      }
    }
  });

  it('says something real before anybody has played', () => {
    expect(knowingLabel(0, 0, 'Sansu')).toMatch(/nothing to go on/i);
    expect(knownLabel(0, 0, 'Sansu')).toMatch(/has not guessed/i);
  });

  it('names them in both directions, so neither is the one being tested', () => {
    expect(knowingLabel(3, 5, 'Sansu')).toContain('Sansu');
    expect(knownLabel(3, 5, 'Sansu')).toContain('Sansu');
  });

  it('counts a perfect round without gloating', () => {
    expect(knowingLabel(5, 5, 'Sansu')).toMatch(/every one/i);
    expect(knowingLabel(1, 1, 'Sansu')).toBe('You knew them');
  });

  it('treats zero as an opening rather than an ending', () => {
    expect(knowingLabel(0, 5, 'Sansu')).toMatch(/conversation/i);
  });
});
