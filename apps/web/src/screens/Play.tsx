import { useEffect, useMemo, useState } from 'react';

import {
  ROUND,
  cardForDay,
  cardsLeft,
  localDateIn,
  matchCardsFor,
  deckOrder,
  getAccent,
  guessRound,
  knowingLabel,
  knownLabel,
  matchLabel,
  topicPacksFor,
  type GuessCard,
  type Side,
} from '@twoends/core';
import { Avatar, Pill } from '@twoends/ui';

import { Button, Field, TextInput } from '../components/Field.tsx';
import type { TabId } from '../components/TabBar.tsx';
import { askQuestion, askToday } from '../db/asks.ts';
import { todaysPrompt } from '../db/daily.ts';
import { notifyPartner } from '../db/push.ts';
import { useChrome, useIsV2 } from '../design/version.ts';
import { supabase } from '../lib/supabase.ts';
import { useAvatars } from '../state/avatars.ts';
import { EMPTY_CARD } from '../db/game.ts';
import { useGame } from '../state/game.ts';
import { useSession } from '../state/session.ts';
import { useToday } from '../state/today.ts';

/**
 * Play.
 *
 * The fourth destination, and the first one that is not about a record of
 * anything. Home is now, Dates is then, Us is the two of you — this is the
 * evening where neither of you has anything to report and the app has, until
 * now, had nothing to offer.
 *
 * Both reference apps have this section and both charge for it. candle's
 * upsell reads "unlock all questions, widgets, games"; the other one runs a
 * 78%-off banner above it. Ours is simply here.
 *
 * Two halves, deliberately unlike each other:
 *
 *  - **This or that** keeps the app's one real mechanic — nothing reveals until
 *    both of you have moved — and removes the writing. It is the version of the
 *    daily question you can play when you are tired, and the reveal is enforced
 *    by a policy rather than by this file. See migration 16.
 *
 *  - **Talk about** stores nothing at all. It is a subject, read out loud, on a
 *    call. Recording an answer would turn a conversation into homework, and the
 *    thing this whole app is for is the conversation.
 */
export function Play({ onGo }: { onGo?: (tab: TabId) => void }) {
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const couple = useSession((s) => s.couple);

  const [view, setView] = useState<'match' | 'guess' | 'talk'>('match');

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const chrome = useChrome(mine);
  const v2 = useIsV2();

  return (
    <div className="bg-void text-chalk min-h-full px-5 pt-6 pb-32">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Play</h1>
          <p className="text-ash mt-1 text-sm">
            Every card, every pack, free — the part the other apps sell.
          </p>
        </header>

        <div className="bg-surface mb-6 flex gap-1 rounded-full p-1">
          {(
            [
              ['match', 'This or that'],
              ['guess', 'Know me?'],
              ['talk', 'Talk about'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`h-10 flex-1 rounded-full text-[0.78rem] font-medium transition-colors ${
                view === key ? 'text-void' : 'text-ash'
              }`}
              style={view === key ? { background: chrome } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'match' && <Match myTint={mine} theirTint={theirs} />}
        {view === 'guess' && <Guess myTint={mine} theirTint={theirs} chrome={chrome} />}
        {view === 'talk' && <Talk tint={chrome} />}

        {/*
          Where the 18+ packs are, said once, at the bottom.

          They were reachable only from a settings screen, which is the wrong
          place to look for them — somebody who wants these comes to the games
          page. It is a line rather than a card, and it sits under everything
          rather than above it, because the point is that it can be found and
          not that it can be sold.

          When it is on, this says so. A switch whose effect you cannot see is a
          switch people turn on twice and then stop trusting.

          **Item 12.** Two things were wrong with it as a permanent fixture at
          the bottom of every sub-tab. It measured 3.43:1 — `ash/70` on black,
          under the bar for text anybody is expected to read — and it was two
          lines of prose that are read once and then sit there forever. One line,
          at full strength, in the proposed look.
        */}
        {couple?.member_b && (
          <div className="mt-10 px-1">
            {couple.adult_packs_enabled ? (
              <p className={`${v2 ? 'text-ash' : 'text-ash/70'} text-sm leading-relaxed`}>
                {v2
                  ? '18+ is on. '
                  : '18+ is on. There are extra cards in the deck and a Just us pack in Talk about. '}
                <button
                  type="button"
                  onClick={() => onGo?.('us')}
                  className="underline underline-offset-4"
                >
                  Turn it off in Us
                </button>
                .
              </p>
            ) : (
              <p className={`${v2 ? 'text-ash' : 'text-ash/70'} text-sm leading-relaxed`}>
                {v2
                  ? 'There is more, if you both want it. '
                  : 'There is more, if you both want it — extra cards and a pack of things to talk about. '}
                <button
                  type="button"
                  onClick={() => onGo?.('us')}
                  className="underline underline-offset-4"
                >
                  Both of you turn on 18+ in Us
                </button>
                .
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── this or that ─────────────────────────────────────────────────────────────

function Match({ myTint, theirTint }: { myTint: string; theirTint: string }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const avatarUrls = useAvatars((s) => s.urls);
  const loadAvatars = useAvatars((s) => s.load);

  const boards = useGame((s) => s.boards);
  const written = useGame((s) => s.written);
  const tally = useGame((s) => s.tally);
  const error = useGame((s) => s.error);
  const loadGame = useGame((s) => s.load);
  const sendPick = useGame((s) => s.pick);

  const coupleId = couple?.id;
  const myId = profile?.id;
  const theirName = partner?.display_name ?? 'them';
  const today = localDateIn(couple?.day_timezone ?? 'UTC');

  useEffect(() => {
    if (coupleId && myId) void loadGame(coupleId, myId);
  }, [coupleId, myId, loadGame]);

  useEffect(() => {
    void loadAvatars([profile?.avatar_path, partner?.avatar_path]);
  }, [loadAvatars, profile?.avatar_path, partner?.avatar_path]);

  /*
    The partner's pick has to land without a pull-to-refresh. Same channel
    pattern as `repository.ts`, kept local because game_picks is not a mirrored
    table and has no Dexie copy to update.
  */
  useEffect(() => {
    if (!coupleId || !myId) return;

    const channel = supabase
      .channel(`game:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_picks', filter: `couple_id=eq.${coupleId}` },
        () => void loadGame(coupleId, myId),
      );
    void channel.subscribe();

    return () => void supabase.removeChannel(channel);
  }, [coupleId, myId, loadGame]);

  /*
    The shipped deck, plus anything they wrote for this game, plus the 18+ half
    once both of them have asked for it. Writing a card makes the loop longer as
    well as more personal, which is the only real answer to a deck running out.
  */
  const deck = useMemo(() => {
    const ours = written
      .filter((card) => card.kind === 'match' && ours18(card, couple?.adult_packs_enabled))
      .map((card) => ({ id: card.id, a: card.a, b: card.b }));
    return [...matchCardsFor({ adultEnabled: couple?.adult_packs_enabled }), ...ours];
  }, [written, couple?.adult_packs_enabled]);

  const todays = useMemo(() => cardForDay(coupleId ?? '', today, deck), [coupleId, today, deck]);

  /*
    Cards from the last fortnight that you answered and they did not. Counted
    rather than listed: the point is that a missed day is not orphaned, and a
    list of them would turn a gentle thing into a backlog.
  */
  const waiting = useMemo(() => {
    let open = 0;
    for (let back = 1; back <= 14; back++) {
      const day = new Date(`${today}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() - back);

      const past = cardForDay(coupleId ?? '', day.toISOString().slice(0, 10), deck);
      if (!past) continue;

      const state = boards.match.get(past.card.id);
      if (state?.mine != null && state.theirs == null) open++;
    }
    return open;
  }, [coupleId, today, deck, boards]);

  if (!todays) {
    return (
      <div className="bg-surface rounded-[28px] p-5">
        <p className="text-ash text-sm leading-relaxed">No cards yet.</p>
      </div>
    );
  }

  const card = todays.card;
  const state = boards.match.get(card.id) ?? EMPTY_CARD;
  const revealed = state.mine != null && state.theirs != null;
  const agreed = revealed && state.mine === state.theirs;

  /*
    A card that has been here before, still carrying what you each said. Nothing
    is revealed that was not already revealed: a repeat can only show a pick
    whose reveal was spent weeks ago.
  */
  const beenHere = todays.cycle > 0 && state.myPickedOn != null && state.myPickedOn < today;

  function pick(side: Side) {
    if (!coupleId || !myId) return;

    /*
      Deliberately no push notification. The cap is two per person per day, and
      spending one on a card would silence the one that matters — "they
      answered". The reveal arrives over realtime instead.
    */
    void sendPick({ coupleId, myId, cardId: card.id, choice: side, today });
  }

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-ash text-sm">{beenHere ? 'today · come round again' : 'today'}</span>
        {state.mine != null && !revealed && (
          <Pill>
            <span
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ background: theirTint }}
              aria-hidden="true"
            />
            waiting on {theirName}
          </Pill>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {([0, 1] as const).map((side) => (
          <Option
            key={side}
            label={side === 0 ? card.a : card.b}
            chosenByMe={state.mine === side}
            chosenByThem={state.theirs === side}
            myTint={myTint}
            theirTint={theirTint}
            me={{
              name: profile?.display_name ?? 'you',
              src: profile?.avatar_path ? avatarUrls.get(profile.avatar_path) : null,
            }}
            them={{
              name: theirName,
              src: partner?.avatar_path ? avatarUrls.get(partner.avatar_path) : null,
            }}
            onClick={() => pick(side)}
          />
        ))}
      </div>

      {/*
        Held to one row so the two option cards never move between "picked" and
        "revealed" — a layout that jumps at the moment of the reveal steals it.
      */}
      <p className="mt-4 min-h-6 text-center text-[0.95rem]">
        {error ? (
          <span style={{ color: '#e4566e' }}>{error}</span>
        ) : revealed ? (
          agreed ? (
            <span style={{ color: myTint }}>You both said that.</span>
          ) : (
            <span className="text-ash">
              You went different ways. {theirName} said &ldquo;
              {state.theirs === 0 ? card.a : card.b}&rdquo;.
            </span>
          )
        ) : state.mine != null ? (
          <span className="text-ash">
            Yours is in. Nothing shows until {theirName} picks — not even that you have.
          </span>
        ) : (
          <span className="text-ash">Pick one. They cannot see it until they have too.</span>
        )}
      </p>

      {/*
        What you each said the time before, which is the whole reason a repeat is
        worth having: the question is no longer the card, it is whether you would
        still answer the same.
      */}
      {beenHere && (
        <div className="bg-surface mt-4 rounded-[24px] p-4">
          <p className="text-ash text-sm leading-relaxed">
            {monthOf(state.myPickedOn)} you said &ldquo;{state.mine === 0 ? card.a : card.b}&rdquo;
            {state.theirs != null && (
              <>
                {' '}
                and {theirName} said &ldquo;{state.theirs === 0 ? card.a : card.b}&rdquo;
              </>
            )}
            . Pick again — it does not have to be the same.
          </p>
        </div>
      )}

      {waiting > 0 && (
        <p className="text-ash/70 mt-4 text-center text-sm">
          {waiting === 1
            ? `One earlier card is still waiting on ${theirName}.`
            : `${waiting} earlier cards are still waiting on ${theirName}.`}
        </p>
      )}

      <div className="bg-surface mt-8 rounded-[28px] p-5">
        <p className="font-display text-[1.15rem] leading-snug font-semibold">
          {matchLabel(tally.agreed, tally.played)}
        </p>
        <p className="text-ash mt-1.5 text-sm leading-relaxed">
          One card a day, out of {todays.size}. Agreeing on everything is not the goal — knowing
          which ones you do not is the point.
        </p>
      </div>
    </>
  );
}

/**
 * Whether a card they wrote may be shown right now.
 *
 * The shipped adult cards live in a separate list, so nothing has to remember to
 * filter them. A written one cannot — it sits in the same table as the rest — so
 * it carries a flag instead, and this is the one place that reads it.
 *
 * The point is not secrecy; they wrote it. It is that somebody who marked a card
 * 18+ in one mood should not meet it again after either of them has turned the
 * packs back off.
 */
const ours18 = (card: { isAdult: boolean }, adultEnabled: boolean | undefined): boolean =>
  !card.isAdult || adultEnabled === true;

/**
 * "In July", for a card that has been here before.
 *
 * The bare month, because the year is noise on a deck that comes round every
 * seven weeks and the point of the line is recognition rather than a date.
 */
function monthOf(isoDate: string | null): string {
  if (!isoDate) return 'Last time';

  const when = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return 'Last time';

  return `In ${when.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })}`;
}

/**
 * One side of a card.
 *
 * Both faces sit on the option they chose, which is the whole reveal: you see
 * where the two of you landed without reading a word. Yours appears the moment
 * you tap; theirs cannot appear before that, because the row is not sent.
 */
function Option({
  label,
  chosenByMe,
  chosenByThem,
  myTint,
  theirTint,
  me,
  them,
  onClick,
}: {
  label: string;
  chosenByMe: boolean;
  chosenByThem: boolean;
  myTint: string;
  theirTint: string;
  me: { name: string; src?: string | null };
  them: { name: string; src?: string | null };
  onClick: () => void;
}) {
  const v2 = useIsV2();

  /*
    Both of you on one option needs a gradient across the two accents; one of
    you needs that person's colour; neither needs the plain surface. Three
    states, one expression, so they cannot drift apart.
  */
  const ground =
    chosenByMe && chosenByThem
      ? `linear-gradient(135deg, color-mix(in oklab, ${myTint} 26%, var(--color-tint-base)), color-mix(in oklab, ${theirTint} 26%, var(--color-tint-base)))`
      : chosenByMe
        ? `color-mix(in oklab, ${myTint} 22%, var(--color-tint-base))`
        : chosenByThem
          ? `color-mix(in oklab, ${theirTint} 22%, var(--color-tint-base))`
          : 'var(--color-surface)';

  /*
    **Item 10.** Yours had a border, a tint and a face; theirs had a tint and a
    face and no border — so a disagreement read as "mine is selected and theirs
    is merely coloured" rather than "we went two ways", which is the whole
    point of the card. Theirs gets the same ring in their own colour, and both
    of you on one option gets both rings, nested.

    The option nobody has taken gets a hairline. Flat black next to a tinted
    card reads as dead rather than as the other thing you could have chosen.
  */
  const outline = v2
    ? chosenByMe && chosenByThem
      ? `inset 0 0 0 1.5px ${myTint}, inset 0 0 0 3.5px ${theirTint}`
      : chosenByMe
        ? `inset 0 0 0 1.5px ${myTint}`
        : chosenByThem
          ? `inset 0 0 0 1.5px ${theirTint}`
          : 'inset 0 0 0 1px var(--color-hairline)'
    : chosenByMe
      ? `inset 0 0 0 1.5px ${myTint}`
      : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={chosenByMe}
      className="relative flex min-h-[6.5rem] w-full items-center rounded-[26px] p-5 text-left transition-[background] duration-200"
      style={{ background: ground, boxShadow: outline }}
    >
      <span className="font-display flex-1 pr-16 text-[1.25rem] leading-[1.2] font-semibold tracking-[-0.01em]">
        {label}
      </span>

      <span className="absolute top-1/2 right-5 flex -translate-y-1/2 -space-x-2.5">
        {chosenByThem && (
          <Avatar
            name={them.name}
            accent={theirTint}
            size={30}
            src={them.src}
            ring="var(--color-tint-base)"
          />
        )}
        {chosenByMe && (
          <Avatar
            name={me.name}
            accent={myTint}
            size={30}
            src={me.src}
            ring="var(--color-tint-base)"
          />
        )}
      </span>
    </button>
  );
}

// ── talk about ───────────────────────────────────────────────────────────────

function Talk({ tint }: { tint: string }) {
  const v2 = useIsV2();
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const loadToday = useToday((s) => s.load);

  /*
    Read off the couple, like the daily question. `adult_packs_enabled` is
    derived by the server from both people's opt-in, so this is one value from
    one row rather than a rule computed twice.
  */
  const packs = useMemo(
    () =>
      topicPacksFor({
        relationshipType: couple?.relationship_type,
        adultEnabled: couple?.adult_packs_enabled,
      }),
    [couple?.relationship_type, couple?.adult_packs_enabled],
  );

  const [packKey, setPackKey] = useState(() => packs[0]?.key ?? 'light');
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pack = packs.find((p) => p.key === packKey) ?? packs[0];

  // Shuffled per couple, so both of you see the same one when one of you says
  // "next" out loud on a call.
  const topics = useMemo(
    () => deckOrder(pack?.topics ?? [], `${couple?.id ?? ''}:${pack?.key ?? ''}`),
    [pack, couple?.id],
  );

  const topic = topics[at % Math.max(1, topics.length)];
  const theirName = partner?.display_name ?? 'them';

  /**
   * Hands the topic to the daily loop, where it becomes today's question for
   * both of you — the same path `Ask` takes, so it behaves like any other day
   * including the part where you answer before you can read theirs.
   */
  async function askIt() {
    if (!couple || !profile || !topic) return;

    setBusy(true);
    setError(null);

    const { id, error: askError } = await askQuestion({
      coupleId: couple.id,
      authorId: profile.id,
      body: topic,
    });
    if (askError || !id) {
      setBusy(false);
      setError(askError ?? 'Could not save that.');
      return;
    }

    const { promptDayId, localDate } = todaysPrompt(couple);
    const { error: dayError } = await askToday({
      coupleId: couple.id,
      promptDayId,
      promptId: id,
      localDate,
    });

    setBusy(false);
    if (dayError) {
      setError(dayError);
      return;
    }

    notifyPartner('asked');
    await loadToday(couple, profile);
    setSent(true);
  }

  if (!pack || !topic) return null;

  return (
    <>
      {packs.length > 1 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {packs.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                setPackKey(p.key);
                setAt(0);
                setSent(false);
              }}
              aria-pressed={p.key === pack.key}
              className={`h-9 shrink-0 rounded-full px-4 text-[0.8rem] font-medium transition-colors ${
                p.key === pack.key ? 'text-void' : 'text-ash bg-surface'
              }`}
              style={p.key === pack.key ? { background: tint } : undefined}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/*
        One topic, large, with nothing else on the screen competing with it.
        This card is meant to be read aloud, so it is set at the size you can
        read from a phone lying on a table.

        **Item 14.** The copy calls these a deck and nothing about them said so:
        "Another" replaced the text in place, so the card never moved and there
        was never anything behind it. Two edges peek out below and a new topic
        is dealt onto them — `key={at}` because an animation that has already
        finished cannot be restarted by a class.
      */}
      <div className="relative">
        {v2 && (
          <>
            <span
              aria-hidden="true"
              className="bg-surface absolute inset-x-4 -bottom-2 h-12 rounded-[28px]"
            />
            <span
              aria-hidden="true"
              className="bg-surface/60 absolute inset-x-8 -bottom-4 h-12 rounded-[28px]"
            />
          </>
        )}
        <div
          key={v2 ? at : undefined}
          className={`relative rounded-[28px] p-6 ${v2 ? 'deal' : ''}`}
          style={{ background: `color-mix(in oklab, ${tint} 14%, var(--color-tint-base))` }}
        >
          <p className="text-[0.7rem] tracking-[0.2em] text-white/45 uppercase">talk about</p>
          <p className="font-display mt-3 text-[1.5rem] leading-[1.25] font-semibold tracking-[-0.01em]">
            {topic}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => {
            setAt((i) => i + 1);
            setSent(false);
            setError(null);
          }}
          className="bg-surface-2 text-chalk h-12 w-full rounded-full text-[0.95rem] font-medium"
        >
          Another
        </button>

        <Button type="button" accent={tint} onClick={() => void askIt()} disabled={busy || sent}>
          {busy ? 'Sending…' : sent ? `Sent — it is today's question` : 'Make it today’s question'}
        </Button>
      </div>

      {error && (
        <p className="mt-3 text-center text-sm" style={{ color: '#e4566e' }}>
          {error}
        </p>
      )}

      <p className="text-ash mt-6 text-[0.9rem] leading-relaxed">
        Nothing here is saved. These are for saying out loud — read one to {theirName} and see where
        it goes. If one of them deserves an answer in writing, send it up to today&rsquo;s question
        instead.
      </p>
    </>
  );
}

// ── do you know me? ──────────────────────────────────────────────────────────

/**
 * Answering as the other person.
 *
 * The mode opens on an explanation and a button rather than on a card, for two
 * reasons. It is the only game here with a right answer, so it needs one
 * sentence of teaching that "this or that" does not. And a round has to stay
 * still while you play it: the five cards are drawn from the ones neither of
 * you has touched, so recomputing that every render would delete the first card
 * from the round the moment you answered it.
 *
 * The round is dealt by a tap — a user action, not an effect — and then held.
 */
function Guess({
  myTint,
  theirTint,
  chrome,
}: {
  myTint: string;
  theirTint: string;
  chrome: string;
}) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const avatarUrls = useAvatars((s) => s.urls);
  const loadAvatars = useAvatars((s) => s.load);
  const v2 = useIsV2();

  const boards = useGame((s) => s.boards);
  const board = boards.guess;
  const written = useGame((s) => s.written);
  const error = useGame((s) => s.error);
  const loadGame = useGame((s) => s.load);
  const sendGuess = useGame((s) => s.guess);

  const coupleId = couple?.id;
  const myId = profile?.id;
  const theirName = partner?.display_name ?? 'them';

  /** The five, frozen. Null before the first deal and between rounds. */
  const [round, setRound] = useState<GuessCard[] | null>(null);
  const [at, setAt] = useState(0);
  /** Your own answer, held between the two taps a deck card asks for. */
  const [pending, setPending] = useState<Side | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    if (coupleId && myId) void loadGame(coupleId, myId);
  }, [coupleId, myId, loadGame]);

  useEffect(() => {
    void loadAvatars([profile?.avatar_path, partner?.avatar_path]);
  }, [loadAvatars, profile?.avatar_path, partner?.avatar_path]);

  useEffect(() => {
    if (!coupleId || !myId) return;
    const channel = supabase
      .channel(`guess:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_picks', filter: `couple_id=eq.${coupleId}` },
        () => void loadGame(coupleId, myId),
      );
    void channel.subscribe();
    return () => void supabase.removeChannel(channel);
  }, [coupleId, myId, loadGame]);

  /*
    Cards with nothing left to guess at.

    Spans both games on purpose, now that they keep separate rows. A card you
    already guessed is finished; a card the two of you *revealed* in This or that
    is worse than finished, because the answer is sitting on the screen behind
    this one. A card only you have picked is still fair game — they have not
    shown you anything.
  */
  const done = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, state] of boards.guess) {
      if (state.myGuess != null) ids.add(id);
    }
    for (const [id, state] of boards.match) {
      if (state.mine != null && state.theirs != null) ids.add(id);
    }
    return ids;
  }, [boards]);

  const cards = matchCardsFor({ adultEnabled: couple?.adult_packs_enabled });
  const mine = written.filter((c) => c.kind === 'guess' && ours18(c, couple?.adult_packs_enabled));
  const left = cardsLeft({ deck: cards, written: mine, done, myId: myId ?? '' });

  function deal() {
    setRound(
      guessRound({
        deck: cards,
        written: mine,
        seed: coupleId ?? '',
        done,
        myId: myId ?? '',
        size: ROUND,
      }),
    );
    setAt(0);
    setPending(null);
  }

  // ── the opening, and the end of a round ────────────────────────────────────

  if (!round || round.length === 0 || at >= round.length) {
    const finished = round != null && round.length > 0;
    return (
      <>
        {finished && round && (
          <Scoreboard round={round} board={board} theirName={theirName} tint={chrome} />
        )}

        <div className="bg-surface rounded-[28px] p-5">
          <p className="font-display text-[1.25rem] leading-snug font-semibold">
            {finished ? 'Another five?' : `How well do you know ${theirName}?`}
          </p>
          <p className="text-ash mt-1.5 text-sm leading-relaxed">
            Five cards, and you answer as {theirName} — not what you would pick, what they would.
            Nothing shows until they have answered too.
          </p>
          {left === 0 && (
            <p className="text-ash mt-2 text-sm leading-relaxed">
              That is every card there is. Write one of your own and there will be more.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2.5">
            <Button accent={chrome} disabled={left === 0} onClick={deal}>
              {left === 0 ? 'No cards left' : `Deal five${left < 12 ? ` · ${left} left` : ''}`}
            </Button>
            <Button variant="quiet" accent={chrome} onClick={() => setComposing(true)}>
              Write one about yourself
            </Button>
          </div>
        </div>

        {composing && <Compose tint={chrome} onDone={() => setComposing(false)} />}
      </>
    );
  }

  // ── a card ─────────────────────────────────────────────────────────────────

  const card = round[at]!;
  const state = board.get(card.id) ?? EMPTY_CARD;

  /** They wrote it about themselves, so there is no answer of yours to give. */
  const isTheirs = card.authorId != null && card.authorId !== myId;
  const answered = state.myGuess != null;
  const revealed = answered && state.theirs != null;
  const wasRight = revealed && state.myGuess === state.theirs;

  /** Which of the two questions this card is asking right now. */
  const asking: 'mine' | 'guess' = isTheirs || pending != null || answered ? 'guess' : 'mine';

  function tap(side: Side) {
    if (!coupleId || !myId || answered) return;

    if (asking === 'mine') {
      setPending(side);
      return;
    }

    /*
      Both halves leave together. The reveal opens as soon as a row exists, so
      sending your own answer first would hand you theirs with the guess still
      to make — which is why a `mode = 'guess'` row carries a constraint that
      the guess is present. This is the client half of that rule; the database
      half is the one that actually holds.
    */
    void sendGuess({
      coupleId,
      myId,
      cardId: card.id,
      guess: side,
      choice: isTheirs ? undefined : (pending ?? undefined),
      today: localDateIn(couple?.day_timezone ?? 'UTC'),
    });
    setPending(null);
  }

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        {v2 ? (
          /*
            The same number, as a thing that visibly shortens. "1 / 5" is a fact
            about a deck; this is the deck. The card you are on is the wide one,
            the ones behind you go to the hairline, the ones to come stay on the
            raised surface.
          */
          <span
            className="flex items-center gap-1.5"
            role="img"
            aria-label={`Card ${at + 1} of ${round.length}`}
          >
            {round.map((c, i) => (
              <span
                key={c.id}
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  width: i === at ? '1.4rem' : '0.5rem',
                  background:
                    i < at ? 'var(--color-hairline)' : i === at ? chrome : 'var(--color-surface-2)',
                }}
              />
            ))}
          </span>
        ) : (
          <span className="text-ash counter text-sm">
            {at + 1} / {round.length}
          </span>
        )}
        <span className="flex items-center gap-2">
          {card.authorId != null && <Pill>{isTheirs ? `${theirName} wrote this` : 'yours'}</Pill>}
          {answered && !revealed && (
            <Pill>
              <span
                className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: theirTint }}
                aria-hidden="true"
              />
              waiting on {theirName}
            </Pill>
          )}
        </span>
      </div>

      {/*
        Dealt, rather than swapped. Keyed on the card so moving through a round
        moves, and so that answering the one you are on — which re-renders this
        block without changing `at` — does not re-deal it under your finger.
      */}
      <div key={v2 ? card.id : undefined} className={v2 ? 'deal' : undefined}>
        {card.body && (
          <p className="font-display mb-3 text-[1.15rem] leading-snug font-semibold">{card.body}</p>
        )}

        <p className="text-ash mb-3 text-sm">
          {answered
            ? 'You said:'
            : asking === 'mine'
              ? 'First — what would you pick?'
              : `Now: what would ${theirName} pick?`}
        </p>

        <div className="flex flex-col gap-3">
          {([0, 1] as const).map((side) => (
            <Option
              key={side}
              label={side === 0 ? card.a : card.b}
              /*
              Before the card is sent the highlight follows whichever half is
              being asked, so a tap you just made stays visible rather than
              vanishing when the question changes under it. Afterwards it means
              what it means everywhere else on this screen: your face on your
              answer, theirs on theirs.
            */
              chosenByMe={
                answered ? state.myGuess === side : asking === 'guess' && pending === side
              }
              chosenByThem={revealed && state.theirs === side}
              myTint={myTint}
              theirTint={theirTint}
              me={{
                name: profile?.display_name ?? 'you',
                src: profile?.avatar_path ? avatarUrls.get(profile.avatar_path) : null,
              }}
              them={{
                name: theirName,
                src: partner?.avatar_path ? avatarUrls.get(partner.avatar_path) : null,
              }}
              onClick={() => tap(side)}
            />
          ))}
        </div>
      </div>

      {/*
        Being wrong is the interesting result and must not be dressed as
        failure. So the line leads with what they actually said and leaves the
        verdict to half a sentence after it, rather than a cross.
      */}
      <p className="mt-4 min-h-6 text-center text-[0.95rem]">
        {error ? (
          <span style={{ color: '#e4566e' }}>{error}</span>
        ) : revealed ? (
          wasRight ? (
            <span style={{ color: myTint }}>{theirName} said that too. You knew it.</span>
          ) : (
            <span className="text-ash">
              {theirName} said &ldquo;{state.theirs === 0 ? card.a : card.b}&rdquo;. Worth asking
              why.
            </span>
          )
        ) : answered ? (
          <span className="text-ash">Sent. You find out when {theirName} answers.</span>
        ) : asking === 'mine' ? (
          <span className="text-ash">Yours first. Then the interesting one.</span>
        ) : (
          <span className="text-ash">Being wrong is the good half of this.</span>
        )}
      </p>

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={() => {
            setPending(null);
            setAt(Math.max(0, at - 1));
          }}
          disabled={at === 0}
          className="bg-surface text-ash h-12 flex-1 rounded-full text-[0.95rem] font-medium disabled:opacity-35"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            setPending(null);
            setAt(at + 1);
          }}
          disabled={!answered}
          className="bg-surface-2 text-chalk h-12 flex-1 rounded-full text-[0.95rem] font-medium disabled:opacity-35"
        >
          {at === round.length - 1 ? 'Finish' : 'Next'}
        </button>
      </div>
    </>
  );
}

interface BoardState {
  mine: Side | null;
  theirs: Side | null;
  myGuess: Side | null;
  theirGuess: Side | null;
}

/**
 * The end of a round, in both directions at once.
 *
 * Two numbers, never one. A score that only measures how well you know them is
 * a report card, and nobody wants one of those from their partner — seeing that
 * they missed two of yours is what makes missing two of theirs funny rather
 * than pointed.
 *
 * Counted over this round only. No history and no average: the point of a set
 * is that it ends.
 */
function Scoreboard({
  round,
  board,
  theirName,
  tint,
}: {
  round: GuessCard[];
  board: Map<string, BoardState>;
  theirName: string;
  tint: string;
}) {
  const score = useMemo(() => {
    let asked = 0;
    let right = 0;
    let theirAsked = 0;
    let theirRight = 0;
    let waiting = 0;

    for (const card of round) {
      const state = board.get(card.id);
      if (!state) continue;

      /*
        A card they have not answered is waiting, not wrong. Counting the two
        the same would tell somebody they had failed a question nobody has
        answered — which is the single easiest way to make this feel unkind.
      */
      if (state.myGuess != null && state.theirs != null) {
        asked++;
        if (state.myGuess === state.theirs) right++;
      } else if (state.myGuess != null) waiting++;

      if (state.theirGuess != null && state.mine != null) {
        theirAsked++;
        if (state.theirGuess === state.mine) theirRight++;
      }
    }

    return { asked, right, theirAsked, theirRight, waiting };
  }, [round, board]);

  return (
    <div className="bg-surface mb-4 rounded-[28px] p-5">
      <p className="font-display text-[1.25rem] leading-snug font-semibold" style={{ color: tint }}>
        {knowingLabel(score.right, score.asked, theirName)}
      </p>
      <p className="text-ash mt-1.5 text-[0.95rem] leading-relaxed">
        {knownLabel(score.theirRight, score.theirAsked, theirName)}
      </p>
      {score.waiting > 0 && (
        <p className="text-ash/70 mt-2 text-sm leading-relaxed">
          {score.waiting === 1
            ? 'One is still waiting on them.'
            : `${score.waiting} are still waiting on them.`}
        </p>
      )}
    </div>
  );
}

/**
 * Writing a card about yourself.
 *
 * The most personal thing in this mode, and the reason it never runs out. Your
 * answer is stored as an ordinary pick, so the reveal policy hides it until
 * they have guessed — there is no secret column anywhere, which is the only
 * reason a card like this is safe to hand to a client at all.
 */
function Compose({ tint, onDone }: { tint: string; onDone: () => void }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const compose = useGame((s) => s.compose);

  const [body, setBody] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [answer, setAnswer] = useState<Side | null>(null);
  const [kind, setKind] = useState<'guess' | 'match'>('guess');
  const [isAdult, setIsAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /*
    A this-or-that needs no answer from its author — both of them answer it when
    it comes round. A card about you does, and that answer is the whole thing
    being guessed at.
  */
  const ready = a.trim().length > 0 && b.trim().length > 0 && (kind === 'match' || answer != null);

  async function save() {
    if (!couple || !profile) return;
    if (kind === 'guess' && answer == null) return;
    setBusy(true);
    setFailed(null);

    const { error } = await compose({
      coupleId: couple.id,
      myId: profile.id,
      body,
      optionA: a,
      optionB: b,
      // A this-or-that records no answer of its own; zero is a placeholder the
      // server never reads for that kind.
      answer: answer ?? 0,
      today: localDateIn(couple.day_timezone ?? 'UTC'),
      kind,
      isAdult,
    });

    setBusy(false);
    if (error) setFailed('Could not save that — it needs signal to reach them.');
    else onDone();
  }

  return (
    <div className="bg-surface mt-4 rounded-[28px] p-5">
      <p className="font-display text-[1.15rem] leading-snug font-semibold">
        {kind === 'guess' ? 'A question about you.' : 'A card for both of you.'}
      </p>
      <p className="text-ash mt-1.5 text-sm leading-relaxed">
        {kind === 'guess'
          ? 'You answer it now, and they only ever find out whether they guessed right. It is a love note wearing a quiz.'
          : 'It joins the deck and turns up as a day of its own, for both of you to answer. The deck runs out; the ones you write do not.'}
      </p>

      {/*
        Which game it is for, first, because it changes what the rest of the
        form is asking. A this-or-that wants two options and nothing else; a
        card about you wants an answer as well.
      */}
      <div className="mt-4 flex gap-2.5">
        {(
          [
            ['guess', 'About me'],
            ['match', 'For both of us'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setKind(key)}
            aria-pressed={kind === key}
            className="h-11 flex-1 rounded-full text-[0.85rem] font-medium"
            style={
              kind === key
                ? { background: tint, color: 'var(--color-void)' }
                : { background: 'var(--color-surface-2)', color: 'var(--color-ash)' }
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <Field label="The question" hint="Optional, and the part that makes the card yours.">
          <TextInput
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={160}
            placeholder="What do I want when I say nothing is wrong?"
          />
        </Field>

        <Field label="One answer">
          <TextInput
            value={a}
            onChange={(e) => setA(e.target.value)}
            maxLength={60}
            placeholder="To be left alone"
          />
        </Field>

        <Field label="The other">
          <TextInput
            value={b}
            onChange={(e) => setB(e.target.value)}
            maxLength={60}
            placeholder="To be asked again"
          />
        </Field>

        {kind === 'guess' && (
          <div>
            <p className="text-ash mb-2 text-sm">Which is true of you?</p>
            <div className="flex gap-2.5">
              {([0, 1] as const).map((side) => {
                const label = (side === 0 ? a : b).trim();
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setAnswer(side)}
                    disabled={label.length === 0}
                    aria-pressed={answer === side}
                    className="min-h-12 flex-1 rounded-2xl px-4 py-3 text-left text-sm disabled:opacity-40"
                    style={{
                      background:
                        answer === side
                          ? `color-mix(in oklab, ${tint} 24%, var(--color-tint-base))`
                          : 'var(--color-surface-2)',
                      boxShadow: answer === side ? `inset 0 0 0 1.5px ${tint}` : undefined,
                    }}
                  >
                    {label || (side === 0 ? 'One answer' : 'The other')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/*
          Only offered when the 18+ packs are already on. A card marked this way
          disappears again if either of them turns them off — somebody who wrote
          it in one mood should not meet it in another.
        */}
        {couple?.adult_packs_enabled && (
          <button
            type="button"
            onClick={() => setIsAdult(!isAdult)}
            aria-pressed={isAdult}
            className="flex min-h-12 items-center justify-between rounded-2xl px-4 py-3 text-left text-sm"
            style={{
              background: isAdult
                ? `color-mix(in oklab, ${tint} 24%, var(--color-tint-base))`
                : 'var(--color-surface-2)',
            }}
          >
            <span>Mark this one 18+</span>
            <span className="text-ash">{isAdult ? 'Yes' : 'No'}</span>
          </button>
        )}

        {failed && (
          <p className="text-sm" style={{ color: '#e4566e' }}>
            {failed}
          </p>
        )}

        <Button accent={tint} disabled={!ready || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Give it to them'}
        </Button>
        <Button variant="quiet" accent={tint} onClick={onDone}>
          Not now
        </Button>
      </div>
    </div>
  );
}
