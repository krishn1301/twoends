import { useEffect, useMemo, useState } from 'react';

import {
  THIS_OR_THAT,
  deckOrder,
  getAccent,
  matchLabel,
  topicPacksFor,
  type Side,
} from '@twoends/core';
import { Avatar, Pill } from '@twoends/ui';

import { Button } from '../components/Field.tsx';
import { askQuestion, askToday } from '../db/asks.ts';
import { todaysPrompt } from '../db/daily.ts';
import { notifyPartner } from '../db/push.ts';
import { supabase } from '../lib/supabase.ts';
import { useAvatars } from '../state/avatars.ts';
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
export function Play() {
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const [view, setView] = useState<'match' | 'talk'>('match');

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;

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
              ['talk', 'Talk about'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={`h-10 flex-1 rounded-full text-[0.82rem] font-medium transition-colors ${
                view === key ? 'text-void' : 'text-ash'
              }`}
              style={view === key ? { background: mine } : undefined}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'match' && <Match myTint={mine} theirTint={theirs} />}
        {view === 'talk' && <Talk tint={mine} />}
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

  const board = useGame((s) => s.board);
  const tally = useGame((s) => s.tally);
  const error = useGame((s) => s.error);
  const loadGame = useGame((s) => s.load);
  const sendPick = useGame((s) => s.pick);
  const resetPicks = useGame((s) => s.reset);

  /**
   * Null means "wherever the board says", which is how this screen opens on the
   * first card you have not finished rather than on card one. Once you have
   * moved yourself, your position wins and stops jumping under you when their
   * pick arrives.
   */
  const [moved, setMoved] = useState<number | null>(null);

  const coupleId = couple?.id;
  const myId = profile?.id;
  const theirName = partner?.display_name ?? 'them';

  /*
    One order per couple, computed on both phones from the couple id. Without
    it the two of you would be shown different cards in different orders and
    would almost never be on the same one — which is the only way this reads as
    something you are doing together rather than two solo quizzes.
  */
  const deck = useMemo(() => deckOrder(THIS_OR_THAT, coupleId ?? ''), [coupleId]);

  useEffect(() => {
    if (coupleId && myId) void loadGame(coupleId, myId);
  }, [coupleId, myId, loadGame]);

  /*
    The two faces are the reveal, so they cannot be missing. Home loads these
    already and the cache is shared — but somebody who opens the app straight
    onto this tab has never been through Home, and would get two initials in
    place of the one image that carries the whole moment.
  */
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
    Derived, not stored in an effect. Coming back to a deck you are eleven cards
    into and being shown the first card again is how a game stops being
    something you return to — but computing it during render rather than
    correcting it afterwards means it is right on the first paint and there is
    no frame showing the wrong card.
  */
  const firstOpen = useMemo(() => {
    const next = deck.findIndex((card) => board.get(card.id)?.mine == null);
    return next === -1 ? Math.max(0, deck.length - 1) : next;
  }, [deck, board]);

  const at = moved ?? firstOpen;
  const card = deck[at];
  const state = card ? (board.get(card.id) ?? { mine: null, theirs: null }) : null;

  function pick(side: Side) {
    if (!coupleId || !myId || !card) return;

    /*
      Stand still.

      `at` follows the first unfinished card until you move yourself, which is
      right when you arrive and wrong the instant you pick: the board updates,
      this card stops being unfinished, and the deck skips to the next one
      before you have seen your own choice light up. On the phone it looked like
      the tap had jumped the card. Pinning the index here means picking shows
      you the result and advancing stays something you do.
    */
    setMoved(at);

    /*
      Deliberately no push notification.

      The cap is two per person per day and a deck is thirty cards — an evening
      of playing would spend both of somebody's notifications and silence the
      one that actually matters, "they answered". The reveal arrives over
      realtime while you are both here, and waits on the card when you are not.
      A relationship app that pushes guilt is a product failure; a game that
      pushes thirty times is worse.
    */
    void sendPick({ coupleId, myId, cardId: card.id, choice: side });
  }

  if (!card || !state) return null;

  const revealed = state.mine != null && state.theirs != null;
  const agreed = revealed && state.mine === state.theirs;

  return (
    <>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-ash counter text-sm">
          {at + 1} / {deck.length}
        </span>
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
        The payoff line. Held to one row so the two option cards never move
        between "picked" and "revealed" — a layout that jumps at the moment of
        the reveal steals the moment.
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
            Yours is in. Nothing shows until {theirName} picks — not even that you
            have.
          </span>
        ) : (
          <span className="text-ash">Pick one. They cannot see it until they have too.</span>
        )}
      </p>

      <div className="mt-6 flex gap-2.5">
        <button
          type="button"
          onClick={() => setMoved(Math.max(0, at - 1))}
          disabled={at === 0}
          className="bg-surface text-ash h-12 flex-1 rounded-full text-[0.95rem] font-medium disabled:opacity-35"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => setMoved(Math.min(deck.length - 1, at + 1))}
          disabled={at >= deck.length - 1}
          className="bg-surface-2 text-chalk h-12 flex-1 rounded-full text-[0.95rem] font-medium disabled:opacity-35"
        >
          Next
        </button>
      </div>

      <div className="bg-surface mt-8 rounded-[28px] p-5">
        <p className="font-display text-[1.15rem] leading-snug font-semibold">
          {matchLabel(tally.agreed, tally.played)}
        </p>
        <p className="text-ash mt-1.5 text-sm leading-relaxed">
          Counted only where you have both picked. Agreeing on everything is not the
          goal — knowing which ones you do not is the point.
        </p>
        {tally.played > 0 && (
          <button
            type="button"
            onClick={() => {
              if (!coupleId || !myId) return;
              // Back to "wherever the board says", which after a reset is card
              // one — without hardcoding that and getting it wrong when their
              // picks are still there.
              setMoved(null);
              void resetPicks(coupleId, myId);
            }}
            className="text-ash mt-2 h-11 text-sm underline underline-offset-4"
          >
            Clear my picks and start again
          </button>
        )}
      </div>
    </>
  );
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
  /*
    Both of you on one option needs a gradient across the two accents; one of
    you needs that person's colour; neither needs the plain surface. Three
    states, one expression, so they cannot drift apart.
  */
  const ground =
    chosenByMe && chosenByThem
      ? `linear-gradient(135deg, color-mix(in oklab, ${myTint} 26%, #15120F), color-mix(in oklab, ${theirTint} 26%, #15120F))`
      : chosenByMe
        ? `color-mix(in oklab, ${myTint} 22%, #15120F)`
        : chosenByThem
          ? `color-mix(in oklab, ${theirTint} 22%, #15120F)`
          : 'var(--color-surface)';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={chosenByMe}
      className="relative flex min-h-[6.5rem] w-full items-center rounded-[26px] p-5 text-left transition-[background] duration-200"
      style={{
        background: ground,
        boxShadow: chosenByMe ? `inset 0 0 0 1.5px ${myTint}` : undefined,
      }}
    >
      <span className="font-display flex-1 pr-16 text-[1.25rem] leading-[1.2] font-semibold tracking-[-0.01em]">
        {label}
      </span>

      <span className="absolute top-1/2 right-5 flex -translate-y-1/2 -space-x-2.5">
        {chosenByThem && (
          <Avatar name={them.name} accent={theirTint} size={30} src={them.src} ring="#15120F" />
        )}
        {chosenByMe && (
          <Avatar name={me.name} accent={myTint} size={30} src={me.src} ring="#15120F" />
        )}
      </span>
    </button>
  );
}

// ── talk about ───────────────────────────────────────────────────────────────

function Talk({ tint }: { tint: string }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const loadToday = useToday((s) => s.load);

  /*
    The adult pack stays shut, exactly as it does for the daily question — the
    flag has no surface in the app yet and inventing one here would be a way of
    shipping the 18+ decision by accident. See CLAUDE.md.
  */
  const packs = useMemo(
    () => topicPacksFor({ relationshipType: couple?.relationship_type }),
    [couple?.relationship_type],
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
      */}
      <div
        className="rounded-[28px] p-6"
        style={{ background: `color-mix(in oklab, ${tint} 14%, #15120F)` }}
      >
        <p className="text-[0.7rem] tracking-[0.2em] text-white/45 uppercase">talk about</p>
        <p className="font-display mt-3 text-[1.5rem] leading-[1.25] font-semibold tracking-[-0.01em]">
          {topic}
        </p>
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
        Nothing here is saved. These are for saying out loud — read one to {theirName} and
        see where it goes. If one of them deserves an answer in writing, send it up to
        today&rsquo;s question instead.
      </p>
    </>
  );
}
