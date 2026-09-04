import { Avatar, Faces, Pill, Rail, Scribble, Section, Snapshot, Tile } from '@twoends/ui';

import { Arrival } from '../components/Arrival.tsx';
import { DrawSurface } from '../components/DrawSurface.tsx';

import { useEffect, useState, type ReactNode } from 'react';

import {
  COLOPHON,
  daysUntil,
  fillsTheScreen,
  heldQuotes,
  localDateIn,
  nextQuote,
  occasionCopy,
} from '@twoends/core';
import { useLiveQuery } from 'dexie-react-hooks';

import { DailyCard } from '../components/DailyCard.tsx';
import { MomentCard } from '../components/MomentCard.tsx';
import { Monogram } from '../components/Monogram.tsx';
import { OccasionCard } from '../components/OccasionCard.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Bubbles, Flame, Heart, Lock } from '../components/icons.tsx';
import type { TabId } from '../components/TabBar.tsx';
import { signedUrls, snapsOnThisDayBefore, type Snap } from '../db/photos.ts';
import { WEEK_LABELS, pad, useDesignModel } from '../design/model.ts';
import { soonestCountdown } from '../db/repository.ts';
import { db } from '../db/schema.ts';
import {
  WIDGETS,
  canPinWidgets,
  pinWidget,
  widgetsSupported,
  type WidgetId,
} from '../lib/widgets.ts';
import { useIsV2 } from '../design/version.ts';
import { useLongPress, useBothPressed, useTapRun } from '../lib/gestures.ts';
import { useAvatars } from '../state/avatars.ts';
import { useDistanceReading, useLocation } from '../state/location.ts';
import { useOccasion } from '../state/occasion.ts';
import { usePresence } from '../state/presence.ts';
import { markSeenToday, seenToday } from '../state/seenToday.ts';
import { useNow } from '../state/useNow.ts';
import { useSession } from '../state/session.ts';
import { useShared } from '../state/shared.ts';
import { Colophon } from './Colophon.tsx';

/**
 * Home.
 *
 * Structure taken from the reference apps after reading both on the S9+: true
 * black, one prominent thing to do, then titled sections each with a "see all"
 * on the right and a horizontal rail of uniform cards, the next one peeking.
 * That shape is why a feature list this long stays browsable without a settings
 * screen.
 *
 * Three things are deliberately ours:
 *
 * 1. Card colour means something. Theirs is an arbitrary rainbow — magenta,
 *    teal, orange, unrelated to anything. Every coloured surface here is your
 *    accent, their accent, or a gradient across both, so the palette of the app
 *    is the couple rather than a brand deck.
 * 2. Where candle puts "Candle Premium — unlock all questions, widgets, games"
 *    and the other app puts a 78%-off countdown, we put one quiet line saying
 *    everything is already unlocked. Same slot, opposite message.
 * 3. The distance badge reads locked until both partners opt in, and shows
 *    distance only, never position. See docs/PRIVACY.md.
 */
export function Home({
  onOpen,
  onGo,
}: {
  onOpen?: (what: 'draw' | 'snap' | 'ask' | 'voice') => void;
  /**
   * Leaves Home for another tab. Every "All ›" and every card that stands for
   * something with a screen of its own goes through this — a card that shows a
   * number and does nothing when you press it reads as broken, and the
   * countdown one was reported as exactly that.
   */
  onGo?: (tab: TabId) => void;
}) {
  const m = useDesignModel();
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const avatarUrls = useAvatars((s) => s.urls);
  const loadAvatars = useAvatars((s) => s.load);
  const loadLocation = useLocation((s) => s.load);
  const distance = useDistanceReading(partner?.display_name);
  const { snaps, urls, canvas, streak, week, quietNow, load } = useShared();

  const myId = profile?.id;

  useEffect(() => {
    if (!couple) return;
    const refresh = () => {
      void load(couple);
      // Foreground, and only foreground. This is the entire schedule on which
      // this app ever reads a position — see db/location.ts.
      if (myId) void loadLocation(myId);
    };
    refresh();
    void loadAvatars([profile?.avatar_path, partner?.avatar_path]);

    // A partner sending a snap or a drawing while the phone was asleep is the
    // normal case, not the exception.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [couple, load, loadAvatars, loadLocation, myId, profile?.avatar_path, partner?.avatar_path]);

  /*
    The next countdown, from Dexie — the same rows the Dates screen writes, and
    chosen by the same rule the widget uses.

    Until now this tile read `SAMPLE_COUNTDOWN` from the design fixtures, so it
    showed an invented trip and an invented number of days regardless of what
    the couple had actually entered. It looked like real data, which is the
    worst way for a placeholder to fail: nothing about it said "sample", so the
    only way to notice was to know what you had typed.
  */
  const nowMs = useNow(60_000).getTime();

  /*
    The couple's own clock, not this device's.

    Both halves of the moment have to agree about which day it is and how far
    into it they are, and two people in two cities do not. `day_timezone` is the
    same field the streak and the daily question are keyed on.
  */
  /*
    Presence: joined while this screen is on and the app is in front.

    Left on background rather than left running, and that is the promise
    working rather than housekeeping — a channel held open while the phone is in
    a pocket would say somebody is here when they are not, which is the one
    thing this indicator must never do.
  */
  const bothHere = usePresence((s) => s.bothHere);
  const joinPresence = usePresence((s) => s.join);
  const leavePresence = usePresence((s) => s.leave);

  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId || !myId) return;

    const sync = () => {
      if (document.visibilityState === 'visible') joinPresence(coupleId, myId);
      else leavePresence();
    };

    sync();
    document.addEventListener('visibilitychange', sync);

    return () => {
      document.removeEventListener('visibilitychange', sync);
      leavePresence();
    };
  }, [couple?.id, myId, joinPresence, leavePresence]);

  const zone = couple?.day_timezone ?? 'UTC';
  const coupleToday = localDateIn(zone, new Date(nowMs));
  const minutesNow = minutesPastMidnightIn(zone, new Date(nowMs));
  const countdown = useLiveQuery(
    async () =>
      soonestCountdown(
        await db.countdowns
          .where('couple_id')
          .equals(couple?.id ?? '')
          .toArray(),
      ) ?? null,
    [couple?.id],
  );
  const countdownDays = countdown ? daysUntil(Date.parse(countdown.target_at), nowMs) : null;

  const latestSnap = snaps[0];
  const latestSnapUrl = latestSnap ? urls.get(latestSnap.storage_path) : undefined;

  /*
    A year ago today, if there was one.

    The payoff for photos lasting: nothing here is possible while a snap is
    swept after a month. It is the one query in the app that is skipped rather
    than run and discarded — a couple who started this spring has no earlier
    year to look in, and asking anyway would be a round trip on every open to be
    told nothing, forever, until their first anniversary.

    Signed separately from the rest. `useShared` signs the recent snaps and
    these are not among them; a URL from an hour ago is no use to a photograph
    nobody has loaded yet.
  */
  // `nowMs` rather than `Date.now()`: React may render twice and get two
  // answers, which is what `react-hooks/purity` is for. It already exists a few
  // lines up for the countdown.
  const yearsTogether = couple?.started_on
    ? Math.floor((nowMs - Date.parse(couple.started_on)) / 31_557_600_000)
    : 0;

  const [thenSnap, setThenSnap] = useState<{ snap: Snap; url: string } | null>(null);

  useEffect(() => {
    const coupleId = couple?.id;
    // No clearing here, and not for tidiness: a `setState` run synchronously
    // inside an effect is a cascading render, and the card is gated on
    // `yearsTogether` where it is drawn anyway.
    if (!coupleId || yearsTogether < 1) return;

    let alive = true;
    void (async () => {
      const found = await snapsOnThisDayBefore(coupleId, new Date(), yearsTogether);
      const first = found[0];
      if (!first || !alive) return;

      const signed = await signedUrls([first.storage_path]);
      const url = signed.get(first.storage_path);
      if (alive && url) setThenSnap({ snap: first, url });
    })();

    return () => {
      alive = false;
    };
  }, [couple?.id, yearsTogether]);
  const hasDrawing = (canvas?.drawing.strokes.length ?? 0) > 0;
  const theirsLatest = canvas?.lastAuthorId != null && canvas.lastAuthorId !== m.myId;

  // Android, in the installed app. A PWA on Android has no widgets either, and
  // this correctly says so.
  const hasWidgets = widgetsSupported();

  /*
    Four things on this screen do something nobody has been told about. None of
    them changes what it looks like, and none of them changes what it *is* —
    see `lib/gestures.ts` for why a hidden gesture must not turn a card into a
    button.
  */
  const [colophon, setColophon] = useState(false);
  const [heldCounter, setHeldCounter] = useState(false);
  /*
    A counter, not a boolean.

    The mark used to be visible for exactly as long as both faces were held,
    which made it a thing you had to keep doing rather than a thing that
    happened. It is a one-shot splash now: the press starts it, the animation
    finishes on its own clock, and bumping this restarts it — `key` on the
    element is what makes a second press replay rather than do nothing.
  */
  const [mark, setMark] = useState(0);

  const wordmark = useTapRun(5, () => setColophon(true));

  /*
    A line is chosen when the hold begins rather than during render, which is
    both correct and required: picking one while rendering is impure, and React
    may render twice and show two different quotes for the same press.
  */
  const [quote, setQuote] = useState<string | null>(null);
  const counterHold = useLongPress(
    () => {
      setHeldCounter(true);
      setQuote((was) => nextQuote(heldQuotes(), was));
    },
    { onRelease: () => setHeldCounter(false) },
  );
  const faces = useBothPressed(() => setMark((n) => n + 1));

  /*
    Today, if today is anything. Kept out of `useDesignModel` on purpose: that
    module is identity and arithmetic now, and the last thing it held which
    looked like data and was not sat on this screen for five phases.
  */
  const occasion = useOccasion();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const bigDay =
    occasion &&
    fillsTheScreen(occasion.kind) &&
    occasion.key !== dismissed &&
    !seenToday(occasion.key)
      ? occasion
      : null;

  const hoursTogether = m.elapsed.days * 24 + m.elapsed.hours;

  /*
    The minute their date makes on a clock — 04:16 and 16:04 for a couple who
    started on the 16th of April. It is the one occasion that is not a whole day,
    so it is never announced and never takes the screen: it lasts sixty seconds
    under the two faces and is either noticed or it is not. `useOccasion` ticks
    on the minute boundary rather than every second, so this appears and goes on
    time without the page re-rendering 86,400 times a day to catch it.
  */
  const minuteLine = occasion?.kind === 'minute' ? occasionCopy('minute')?.line : null;

  const mine = m.myAccent.onDark;
  const theirs = m.theirAccent.onDark;
  const shared = `linear-gradient(145deg, ${mine}, ${theirs})`;
  const v2 = useIsV2();

  return (
    <div className="bg-void text-chalk min-h-full">
      <div className="mx-auto max-w-md pt-4 pb-32">
        <header className="mb-6 flex items-center justify-between px-5">
          {/*
            Five taps opens the colophon. Left as a `span` rather than promoted
            to a button: a focus ring and an "About, button" announcement would
            make it a menu item, and this is meant to be found rather than
            offered. The page it opens has an ordinary row in Us as well, so
            nothing is only reachable this way.
          */}
          <span
            {...wordmark}
            className="font-display text-2xl leading-none font-semibold tracking-tight"
          >
            twoends
          </span>
          {/*
            Dimmed rather than hidden or zeroed while quiet mode is on. The
            streak is paused, not lost, and a counter that vanished would look
            exactly like one that had broken — which is the thing quiet mode
            exists to promise will not happen.
          */}
          <span
            className="bg-surface-2 counter flex items-center gap-1.5 rounded-full px-3 py-2 text-sm"
            style={quietNow ? { opacity: 0.45 } : undefined}
            title={
              quietNow
                ? `Quiet mode is on. Your streak is paused at ${streak.current} and these days will not count as missed.`
                : `${streak.current} day streak — two missed days a month are forgiven`
            }
          >
            <Flame color={mine} />
            {streak.current}
          </span>
        </header>

        {/*
          The pair, before anything else.

          A thumb on each face at the same time slides them into the app's own
          mark — which *is* the two of you overlapping, and which nothing in the
          app has ever said out loud. One face held alone does nothing however
          long you hold it; the gesture is the meaning.
        */}
        <div className="rise relative mb-6 px-5">
          {mark > 0 && (
            <div
              key={mark}
              /*
                Cleared by the animation ending rather than by a timer. A
                `setTimeout` would drift out of step with the CSS the moment
                either duration was touched, and would keep running if the tab
                went to sleep halfway through.
              */
              onAnimationEnd={(e) => {
                // Animation events bubble, so the inner span's would clear this
                // too — a frame early, unmounting the backdrop mid-fade. Only
                // this element's own ending counts.
                if (e.target === e.currentTarget) setMark(0);
              }}
              className="monogram-ground bg-void pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-visible"
              aria-live="polite"
            >
              <span className="monogram-splash inline-flex">
                <Monogram
                  mine={m.myName}
                  theirs={m.theirName}
                  myAccent={profile?.accent_key}
                  theirAccent={partner?.accent_key}
                  size={76}
                />
              </span>
            </div>
          )}
          <Faces
            myPress={faces.first}
            theirPress={faces.second}
            myName={m.myName}
            myAccent={mine}
            mySrc={profile?.avatar_path ? avatarUrls.get(profile.avatar_path) : null}
            theirName={m.theirName}
            theirAccent={theirs}
            theirSrc={partner?.avatar_path ? avatarUrls.get(partner.avatar_path) : null}
            lineColor="#3A322D"
            bothHere={bothHere}
            middle={
              /*
                The distance badge, and the only place on Home that says anything
                about location. It shows how far, never where, and it reads
                locked until both of you have switched it on — which is also
                exactly what it looks like when one of you switches it off.
              */
              distance.km === null ? (
                <span
                  className="bg-surface-2 text-ash relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
                  title={distance.note}
                >
                  <Lock />
                  km
                </span>
              ) : (
                <span
                  className="bg-surface-2 relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm"
                  title={distance.note}
                >
                  {/*
                    Neutral, not an accent. How far apart the two of you are is
                    not something either of you authored and not a control —
                    it is a reading, and a reading in somebody's colour implies
                    it belongs to them. The two faces on either side of it are
                    already carrying the colour.
                  */}
                  <span className="counter text-chalk">{distance.label}</span>
                  {distance.kind === 'apart' && <span className="text-ash">km</span>}
                </span>
              )
            }
          />

          {/*
            Said in words, not only in a line going solid.

            The line was the whole indicator and it was too quiet to be one: a
            change you have to have seen the before-state to notice is not a
            signal. This says it, in the other person's colour, and disappears
            the moment they close the app.
          */}
          {bothHere && (
            <p className="mt-3 text-center text-[0.85rem]" style={{ color: theirs }}>
              {m.theirName} is here too, right now.
            </p>
          )}

          {minuteLine && (
            <p className="mt-3 text-center text-[0.8rem] leading-relaxed" style={{ color: mine }}>
              {minuteLine}
            </p>
          )}
        </div>

        {/* The one thing the screen is asking for — real data, not a fixture. */}
        <div className="rise mb-9 px-5" style={{ animationDelay: '60ms' }}>
          <DailyCard onAsk={() => onOpen?.('ask')} />
        </div>

        {/*
          The twenty minutes, when they are open.

          Under the daily question rather than above it: the question is the
          thing the app is for and this is the thing it does *to* you. It
          renders nothing at all outside the window and nothing on a day that
          was missed with nothing taken — a card spending the other
          twenty-three hours saying "you missed it" would make a gentle thing
          into a scoreboard.
        */}
        {/*
          Being in the same place, offered rather than assumed.

          Above the moment because it changes what the rest of the screen means:
          while it is open the distance card is gone, the questions stop being
          about being apart, and nothing nudges. It shows a plain prompt the
          rest of the time, which is the cost of never triggering on GPS — a
          coarse, opt-in, sometimes hours-old position is not something to
          rearrange an interface on.
        */}
        <div className="rise mb-9 px-5" style={{ animationDelay: '75ms' }}>
          <Arrival
            mine={mine}
            theirs={theirs}
            arrived={countdown && countdownDays === 0 ? { title: countdown.title } : null}
            onChanged={() => {
              if (couple) void load(couple);
            }}
          />
        </div>

        {/*
          Same thing, same time — the live slot.

          There are two of these and each hides itself when the moment does not
          belong to it: prominent for the hour it is running, and down at the
          bottom before and after. The card owns that rule, and its own wrapper
          with it — this used to be a `mb-9` around a component that returns
          null for most of the day, so the margin was there whether or not
          anything was.
        */}
        <MomentCard
          place="top"
          delay="90ms"
          minutes={minutesNow}
          localDate={coupleToday}
          mine={mine}
          theirs={theirs}
        />

        <div className="flex flex-col gap-9">
          <div className="rise" style={{ animationDelay: '120ms' }}>
            <Section title="Today" action="All" onAction={() => onOpen?.('snap')}>
              <Rail>
                {latestSnapUrl ? (
                  <Tile
                    eyebrow="snap"
                    headline={latestSnap?.caption ?? 'Right now'}
                    onClick={() => onOpen?.('snap')}
                  >
                    <img
                      src={latestSnapUrl}
                      alt={latestSnap?.caption ?? 'A photo they sent'}
                      className="h-full w-full object-cover"
                    />
                    <span
                      className="absolute inset-x-0 bottom-0 h-3/5"
                      style={{
                        background: 'linear-gradient(to top, rgba(0,0,0,0.82), transparent)',
                      }}
                      aria-hidden="true"
                    />
                    {latestSnap && latestSnap.author_id !== m.myId && (
                      <div className="absolute top-3.5 right-3.5">
                        <Avatar name={m.theirName} accent={theirs} size={26} />
                      </div>
                    )}
                  </Tile>
                ) : (
                  <Tile
                    ground={`color-mix(in oklab, ${mine} 18%, var(--color-tint-base))`}
                    eyebrow="snap"
                    headline="Send a photo of right now"
                    onClick={() => onOpen?.('snap')}
                  />
                )}

                {hasDrawing && canvas ? (
                  <Tile
                    eyebrow="canvas"
                    headline={theirsLatest ? 'They added something' : 'Your canvas'}
                    onClick={() => onOpen?.('draw')}
                  >
                    <div className="absolute inset-x-3 top-2 bottom-16">
                      <DrawSurface
                        readOnly
                        color={theirsLatest ? theirs : mine}
                        drawing={canvas.drawing}
                        className="h-full"
                      />
                    </div>
                  </Tile>
                ) : (
                  <Tile
                    eyebrow="canvas"
                    headline="Draw them something"
                    onClick={() => onOpen?.('draw')}
                  >
                    <div className="absolute inset-x-4 top-3 bottom-16">
                      <Scribble color={mine} className="h-full w-full" />
                    </div>
                  </Tile>
                )}

                {/*
                  Voice, beside the photograph rather than inside it. They are
                  the two halves of "something from right now", and a person
                  looking for one will find the other.
                */}
                <Tile
                  /*
                    The only gradient tile in the rail, and the only one across
                    both accents. It and "Send one back" were carrying the
                    identical single-accent mix and no illustration between
                    them, so two different things read as one repeated thing.
                    A voice note is the one card here that is about both of you
                    talking, and the ground now says so.
                  */
                  ground={`linear-gradient(145deg, color-mix(in oklab, ${mine} 22%, var(--color-tint-base)), color-mix(in oklab, ${theirs} 22%, var(--color-tint-base)))`}
                  eyebrow="voice"
                  headline="Say something"
                  footnote="thirty seconds"
                  onClick={() => onOpen?.('voice')}
                >
                  <div className="absolute inset-x-5 top-4 bottom-20">
                    <Bubbles mine={mine} theirs={theirs} className="h-full w-full" />
                  </div>
                </Tile>

                <Tile
                  ground={`color-mix(in oklab, ${mine} 18%, var(--color-tint-base))`}
                  eyebrow="your turn"
                  headline="Send one back"
                  badge={<Pill>you</Pill>}
                  onClick={() => onOpen?.('snap')}
                />

                {/*
                  Only when there is one. A card that says "nothing from this
                  day last year" every day for a year is worse than no card.
                */}
                {yearsTogether >= 1 && thenSnap && (
                  <Tile
                    eyebrow={yearAgoLabel(thenSnap.snap.created_at, nowMs)}
                    headline={thenSnap.snap.caption ?? 'This day, before'}
                    onClick={() => onOpen?.('snap')}
                  >
                    <img
                      src={thenSnap.url}
                      alt={thenSnap.snap.caption ?? 'A photo from this day in an earlier year'}
                      className="h-full w-full object-cover"
                    />
                    <span
                      className="absolute inset-x-0 bottom-0 h-3/5"
                      style={{
                        background: 'linear-gradient(to top, rgba(0,0,0,0.82), transparent)',
                      }}
                      aria-hidden="true"
                    />
                  </Tile>
                )}
              </Rail>
            </Section>
          </div>

          <div className="rise" style={{ animationDelay: '180ms' }}>
            <Section title="Together" action="All" onAction={() => onGo?.('dates')}>
              <Rail>
                {/*
                  **Item 4, second pass.** The first one put a 46-52% black
                  overlay across the whole card so the small labels would clear
                  4.5:1 on any pair of accents. It worked and it cost the card
                  everything it had: the two-accent diagonal is the best thing
                  in the app and it came out brown and flat.

                  The scrim is bottom-only now, where the eyebrow is, and the
                  labels in the top half take a shadow instead. A shadow is not
                  a contrast ratio and does not pretend to be one — but the
                  choice here was never "scrim or nothing", it was "scrim or the
                  original", and the original had white at 70% with nothing at
                  all behind it.
                */}
                <Tile wide ground={shared} eyebrow="anniversary" onAccent={v2}>
                  {/*
                    The whole card is the target, not just the numbers.

                    The handlers used to sit on the text block, so most of the
                    card did nothing and a thumb that landed on the numbers
                    themselves selected them instead — a long press on text is a
                    text selection unless something says otherwise. `inset-0`
                    fixes the first, and refusing selection and the callout menu
                    fixes the second.

                    Still not a `<button>`. Giving `Tile` an `onClick` would
                    announce it to a screen reader as actionable and give it a
                    focus ring, which is the opposite of a thing you are meant
                    to find.
                  */}
                  <div
                    {...counterHold}
                    className="absolute inset-0 z-20 select-none [-webkit-touch-callout:none] [-webkit-user-select:none]"
                  >
                    <div className="absolute inset-x-4 top-1/2 -translate-y-[60%]">
                      {heldCounter ? (
                        <>
                          <p className="counter text-[1.9rem] leading-none font-medium text-white">
                            {hoursTogether.toLocaleString('en-GB')}
                          </p>
                          {/*
                            The unit, in the same key as the `day / hr / min /
                            sec` row it replaces, so holding the card changes
                            what is counted and not how the card is built.
                          */}
                          <p
                            className={`mt-2 text-[0.6rem] tracking-[0.2em] uppercase ${v2 ? 'text-white' : 'text-white/70'}`}
                            style={v2 ? { textShadow: LABEL_SHADOW } : undefined}
                          >
                            hours
                          </p>
                          {/*
                            A different line every time it is held. The counter
                            is already the grand gesture; this one is ordinary on
                            purpose, because two of them would be shouting.
                          */}
                          {quote && (
                            <p
                              className={`mt-2 max-w-[15rem] text-[0.78rem] leading-snug italic ${v2 ? 'text-white' : 'text-white/85'}`}
                              style={v2 ? { textShadow: LABEL_SHADOW } : undefined}
                            >
                              {quote}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="counter text-[1.9rem] leading-none font-medium text-white">
                            {m.elapsed.days}
                            <span className="opacity-50">:</span>
                            {pad(m.elapsed.hours)}
                            <span className="opacity-50">:</span>
                            {pad(m.elapsed.minutes)}
                            <span className="opacity-50">:</span>
                            {pad(m.elapsed.seconds)}
                          </p>
                          <p
                            className={`mt-2 flex gap-[2.1rem] text-[0.6rem] tracking-[0.2em] uppercase ${v2 ? 'text-white' : 'text-white/70'}`}
                            style={v2 ? { textShadow: LABEL_SHADOW } : undefined}
                          >
                            <span>day</span>
                            <span>hr</span>
                            <span>min</span>
                            <span>sec</span>
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </Tile>

                {/*
                  Tappable, because it is a real thing with a real screen. The
                  ground is the couple's own colour rather than a stock photo —
                  the old placeholder gradient was doing a convincing impression
                  of a picture of a holiday nobody had booked.
                */}
                {countdown ? (
                  <Tile
                    ground={`color-mix(in oklab, ${theirs} 20%, var(--color-tint-base))`}
                    eyebrow="countdown"
                    headline={countdown.title}
                    footnote={whenLabel(countdown.target_at)}
                    onClick={() => onGo?.('dates')}
                  >
                    <p
                      className="counter absolute top-3.5 right-4 text-[2.2rem] leading-none font-medium"
                      style={{ color: theirs }}
                    >
                      {countdownDays}
                    </p>
                    <p className="absolute top-[3.1rem] right-4 text-[0.6rem] tracking-[0.2em] text-white/55 uppercase">
                      {countdownDays === 1 ? 'day' : 'days'}
                    </p>
                  </Tile>
                ) : (
                  <Tile
                    eyebrow="countdown"
                    headline="Something to look forward to"
                    footnote="a trip, a birthday, the next room you share"
                    onClick={() => onGo?.('dates')}
                  >
                    <div className="absolute inset-x-4 top-5 flex items-baseline gap-1">
                      <span className="counter text-[2.2rem] leading-none font-medium text-white/25">
                        00
                      </span>
                    </div>
                  </Tile>
                )}

                <Tile
                  eyebrow="this week"
                  headline={streak.current === 0 ? 'No streak yet' : `${streak.current} days`}
                >
                  {/*
                    **Item 11.** Seven markers in a four-column grid wrap to
                    4 + 3 and read as a calendar row that has broken, which is
                    the worst thing a streak tile can look like. One row of
                    seven, smaller, in the proposed look: 7 x 1.15rem inside the
                    tile's usable width.

                    Seven columns that share the width, not seven fixed circles:
                    the tile is `44vw`, so a fixed diameter that fits a 360px
                    handset overflows a 320px one — and the failure mode of a
                    row that does not fit is the same broken calendar this is
                    fixing. `aspect-square` is only a hint when the content is
                    bigger than the box, and here the content is one 8px letter.
                  */}
                  <div
                    className={
                      v2
                        ? 'absolute inset-x-3.5 top-4 grid grid-cols-7 gap-1'
                        : 'absolute inset-x-3.5 top-4 grid grid-cols-4 gap-1.5'
                    }
                  >
                    {week.map((mark, i) => (
                      <span
                        key={WEEK_LABELS[i]}
                        className={`grid place-items-center rounded-full ${v2 ? 'aspect-square w-full text-[0.5rem]' : 'h-7 w-7 text-[0.6rem]'}`}
                        style={
                          mark === 'done'
                            ? { background: v2 ? m.chrome : mine, color: '#000' }
                            : mark === 'grace'
                              ? { border: `1px dashed ${theirs}`, color: 'var(--color-ash)' }
                              : {
                                  background: 'rgba(255,255,255,0.07)',
                                  color: 'var(--color-ash)',
                                }
                        }
                        title={mark === 'grace' ? 'Missed, and forgiven' : mark}
                      >
                        {WEEK_LABELS[i]}
                      </span>
                    ))}
                  </div>
                </Tile>

                {/*
                  Distance, in the app rather than only on a widget. Most of the
                  people this is for are on iPhones and cannot install the APK at
                  all, so every feature has to be complete without one.
                */}
                {/*
                  **Item 5.** Everything on this tile was pinned independently:
                  the number to `right-4 bottom-14`, the eyebrow and headline to
                  the bottom with a two-line clamp. A two-line note — "km from
                  Sansu Baby" — grows *upward*, straight into the number, and
                  the empty state has the mirror problem, truncating to "Turn on
                  location to se…".

                  Three zones stacked in order instead, so the note cannot run
                  under the number and the empty headline has two lines to use.
                  The labels are rendered here rather than handed to `Tile`
                  precisely because `Tile` pins its own label block to the
                  bottom, which is the thing being undone.
                */}
                {/*
                  Nothing at all while they are together. "0 km" is a worse
                  answer than not asking, and the together-since counter above
                  is already saying the true thing.
                */}
                {couple?.together ? null : v2 ? (
                  <Tile onClick={() => onGo?.('us')}>
                    <div className="flex h-full flex-col justify-between p-3.5">
                      <div className="flex items-center">
                        <Avatar name={m.myName} accent={mine} size={26} />
                        <span className="mx-1.5 flex-1 border-t border-dashed border-white/25" />
                        <Avatar name={m.theirName} accent={theirs} size={26} />
                      </div>

                      <p
                        className="counter text-[1.6rem] leading-none font-medium"
                        style={{
                          color: distance.km === null ? 'var(--color-ash)' : 'var(--color-chalk)',
                        }}
                      >
                        {distance.label}
                      </p>

                      <div>
                        <p className="mb-1 text-[0.78rem] leading-none text-white/60">
                          {distance.kind === 'apart' ? 'apart' : 'distance'}
                        </p>
                        <p className="font-display line-clamp-2 text-[1.05rem] leading-[1.16] font-semibold tracking-[-0.01em] text-white">
                          {distance.note}
                        </p>
                        {distance.since && (
                          <p className="mt-1 truncate text-[0.68rem] leading-none text-white/45">
                            as of {distance.since}
                          </p>
                        )}
                      </div>
                    </div>
                  </Tile>
                ) : (
                  <Tile
                    eyebrow={distance.kind === 'apart' ? 'apart' : 'distance'}
                    headline={distance.note}
                    footnote={distance.since ? `as of ${distance.since}` : undefined}
                    onClick={() => onGo?.('us')}
                  >
                    <div className="absolute inset-x-4 top-4 flex items-center">
                      <Avatar name={m.myName} accent={mine} size={28} />
                      <span className="mx-1.5 flex-1 border-t border-dashed border-white/25" />
                      <Avatar name={m.theirName} accent={theirs} size={28} />
                    </div>
                    <p
                      className="counter absolute right-4 bottom-14 text-[1.6rem] leading-none font-medium"
                      style={{
                        color: distance.km === null ? '#948A82' : 'var(--color-chalk)',
                      }}
                    >
                      {distance.label}
                    </p>
                  </Tile>
                )}
              </Rail>
            </Section>
          </div>

          {/*
            Widgets, only where there are widgets.

            This rail is four pictures of something the phone can put on its home
            screen, and on a device that cannot do that it is an advert for a
            feature the reader will never reach. Most of the people this app is
            for are on iPhones and cannot install the APK at all — showing them
            the rail would make the one honest screen in the app dishonest.

            They are not being fobbed off: notifications carry the same idea, and
            iOS widgets are Phase 8. The card below says both, which is more than
            "Widgets" and a row of teasers said.
          */}
          {/*
            **Item 12.** Both of the cards below are promises worth making and
            they are made once and read once, after which they are simply the
            bottom of the app, forever. One line each in the proposed look — the
            long versions live in Us and the colophon, where the rest of the
            promises already are.
          */}
          {!hasWidgets &&
            (v2 ? (
              <p
                className="rise text-ash px-5 text-sm leading-relaxed"
                style={{ animationDelay: '240ms' }}
              >
                Home-screen widgets are on Android for now. iPhone widgets are next.
              </p>
            ) : (
              <div className="rise px-5" style={{ animationDelay: '240ms' }}>
                <div className="bg-surface rounded-[28px] p-5">
                  <p className="font-display text-[1.25rem] leading-snug font-semibold">
                    Home-screen widgets are on Android for now.
                  </p>
                  <p className="text-ash mt-1.5 text-sm leading-relaxed">
                    Everything else works here exactly the same. Add TwoEnds to your Home Screen and
                    turn on notifications, and {m.theirName} still reaches you without you opening
                    anything. iPhone widgets are next.
                  </p>
                </div>
              </div>
            ))}

          {hasWidgets && (
            <div className="rise" style={{ animationDelay: '240ms' }}>
              <WidgetsRail
                mine={mine}
                theirs={theirs}
                shared={shared}
                m={m}
                mySrc={profile?.avatar_path ? avatarUrls.get(profile.avatar_path) : null}
                theirSrc={partner?.avatar_path ? avatarUrls.get(partner.avatar_path) : null}
              />
            </div>
          )}

          {/* Where both reference apps put the paywall. */}
          {v2 ? (
            <p
              className="rise text-ash px-5 text-sm leading-relaxed"
              style={{ animationDelay: '300ms' }}
            >
              Everything is already unlocked. No tier, no trial, no ads.
            </p>
          ) : (
            <div className="rise px-5" style={{ animationDelay: '300ms' }}>
              <div className="bg-surface rounded-[28px] p-5">
                <p className="font-display text-[1.25rem] leading-snug font-semibold">
                  Everything is already unlocked.
                </p>
                <p className="text-ash mt-1.5 text-sm leading-relaxed">
                  Every widget, every question pack, every game. No tier, no trial, no ads. It stays
                  that way.
                </p>
              </div>
            </div>
          )}

          {/* And the quiet slot: not yet, or over. See the top one. */}
          <MomentCard
            place="bottom"
            delay="330ms"
            minutes={minutesNow}
            localDate={coupleToday}
            mine={mine}
            theirs={theirs}
          />
        </div>
      </div>

      {/*
        A day that is not an ordinary day, once, on the first open of it. The
        record of having shown it is written on dismissal rather than on render,
        so a card closed by the app being killed mid-animation still comes back.
      */}
      {bigDay && (
        <OccasionCard
          occasion={bigDay}
          mine={mine}
          theirs={theirs}
          myName={m.myName}
          theirName={m.theirName}
          myAccent={profile?.accent_key}
          theirAccent={partner?.accent_key}
          onDismiss={() => {
            markSeenToday(bigDay.key);
            setDismissed(bigDay.key);
          }}
        />
      )}

      {colophon && (
        <Sheet title={COLOPHON.title} onClose={() => setColophon(false)}>
          <Colophon />
        </Sheet>
      )}
    </div>
  );
}

/**
 * The widgets, and a way to actually get one.
 *
 * This rail used to be four pictures of widgets with nothing behind them —
 * pretty, and completely inert. The widgets were registered, installed and
 * working, and were still reported as "I am not getting any options to add
 * widgets", because the only route to them was: long-press an empty part of the
 * home screen, find Widgets, scroll to TwoEnds, press and hold, drag. Nobody
 * does that for an app they installed ten minutes ago.
 *
 * Now each card asks the launcher to place it. The launcher shows its own
 * confirmation — an app that could put things on your home screen silently
 * would be a worse thing to install — so the honest state after a tap is
 * "asked", never "added".
 */
/*
  What holds a 9.6px label up on a full-strength accent once the scrim over it
  has gone. Not a contrast ratio — nothing about a shadow is measurable — but
  the alternative on this card was white at 70% over nothing.
*/
const LABEL_SHADOW = '0 1px 2px rgb(0 0 0 / 0.55), 0 0 8px rgb(0 0 0 / 0.35)';

function WidgetsRail({
  mine,
  theirs,
  shared,
  m,
  mySrc,
  theirSrc,
}: {
  mine: string;
  theirs: string;
  shared: string;
  m: { myName: string; theirName: string };
  mySrc?: string | null;
  theirSrc?: string | null;
}) {
  const v2 = useIsV2();
  const [canPin, setCanPin] = useState(false);
  const [asked, setAsked] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void canPinWidgets().then((ok) => {
      if (alive) setCanPin(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  /*
    A picture of what you would actually get.

    This rail used to advertise a different design from the one the launcher
    draws — a bare "12", four flat dots, nothing at all for the anniversary —
    which made it a brochure for a product that had been replaced. Each card
    below is now the widget in miniature, faces included, so what you tap for is
    what arrives.
  */
  const pair = (size: number, gap: boolean) => (
    <div className="flex items-center" style={{ marginLeft: gap ? 0 : -size * 0.22 }}>
      <Avatar name={m.myName} accent={mine} size={size} src={mySrc} ring="var(--color-tint-base)" />
      {gap && (
        <span className="mx-1 flex-1 border-t border-dashed border-white/25" aria-hidden="true" />
      )}
      <span style={{ marginLeft: gap ? 0 : -size * 0.22 }}>
        <Avatar
          name={m.theirName}
          accent={theirs}
          size={size}
          src={theirSrc}
          ring="var(--color-tint-base)"
        />
      </span>
    </div>
  );

  const art: Record<WidgetId, ReactNode> = {
    snaps: (
      <>
        <Snapshot seed={1} className="h-full w-full" />
        <span
          className="absolute inset-x-0 bottom-0 h-3/5"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}
          aria-hidden="true"
        />
        <span className="absolute top-3 right-3">
          <Avatar
            name={m.theirName}
            accent={theirs}
            size={26}
            src={theirSrc}
            ring="var(--color-tint-base)"
          />
        </span>
      </>
    ),
    canvas: (
      <>
        <div className="absolute inset-x-4 top-6 bottom-16">
          <Scribble color={theirs} className="h-full w-full" />
        </div>
        <span className="absolute top-3 right-3">
          <Avatar
            name={m.theirName}
            accent={theirs}
            size={26}
            src={theirSrc}
            ring="var(--color-tint-base)"
          />
        </span>
      </>
    ),
    anniversary: <div className="absolute top-4 right-3.5">{pair(28, false)}</div>,
    countdown: (
      <>
        <p className="counter absolute top-4 right-4 text-[1.8rem] leading-none font-medium text-white/35">
          12
        </p>
        <div className="absolute inset-x-4 top-16 h-[3px] overflow-hidden rounded-full bg-white/12">
          <span className="block h-full w-2/3 rounded-full" style={{ background: theirs }} />
        </div>
      </>
    ),
    streak: (
      <>
        <div className="absolute top-3.5 left-3.5">{pair(26, false)}</div>
        <div className="absolute inset-x-3.5 top-16 flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="h-5 w-5 rounded-full"
              style={{ background: i < 3 ? mine : 'rgba(255,255,255,0.08)' }}
            />
          ))}
        </div>
      </>
    ),
    distance: (
      <>
        <p
          className="counter absolute top-4 left-4 text-[1.35rem] leading-none"
          style={{ color: theirs }}
        >
          1150
        </p>
        <div className="absolute inset-x-4 top-[3.6rem] flex items-center">
          <Avatar
            name={m.myName}
            accent={mine}
            size={30}
            src={mySrc}
            ring="var(--color-tint-base)"
          />
          <span className="relative mx-1 flex-1">
            <span className="block border-t border-white/25" aria-hidden="true" />
            <Heart
              from={mine}
              to={theirs}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          </span>
          <Avatar
            name={m.theirName}
            accent={theirs}
            size={30}
            src={theirSrc}
            ring="var(--color-tint-base)"
          />
        </div>
      </>
    ),
    distanceStrip: (
      <div className="absolute inset-x-4 top-7 flex items-center gap-2.5">
        <span className="relative flex items-center">
          <Avatar
            name={m.myName}
            accent={mine}
            size={22}
            src={mySrc}
            ring="var(--color-tint-base)"
          />
          <span className="relative mx-1 w-5">
            <span className="block border-t border-white/25" aria-hidden="true" />
            <Heart
              from={mine}
              to={theirs}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          </span>
          <Avatar
            name={m.theirName}
            accent={theirs}
            size={22}
            src={theirSrc}
            ring="var(--color-tint-base)"
          />
        </span>
        <span className="counter text-[1.05rem] leading-none" style={{ color: theirs }}>
          1150
        </span>
      </div>
    ),
  };

  return (
    <Section title="Widgets">
      <Rail>
        {WIDGETS.map((widget) => (
          <Tile
            key={widget.id}
            ground={widget.id === 'anniversary' ? shared : undefined}
            /* Item 4: the one tile in this rail whose ground is a full accent. */
            onAccent={v2 && widget.id === 'anniversary'}
            eyebrow={widget.name.toLowerCase()}
            headline={widget.note}
            footnote={asked === widget.id ? 'asked your launcher' : undefined}
            badge={canPin ? <Pill>{asked === widget.id ? 'sent' : 'add'}</Pill> : undefined}
            onClick={
              canPin
                ? () => {
                    setAsked(widget.id);
                    void pinWidget(widget.id);
                  }
                : undefined
            }
          >
            {art[widget.id]}
          </Tile>
        ))}
      </Rail>

      {!canPin && (
        <p className="text-ash px-5 text-sm leading-relaxed">
          This launcher will not let an app place a widget for you. Long-press an empty part of your
          home screen, tap Widgets, and look for TwoEnds.
        </p>
      )}
    </Section>
  );
}

/**
 * The date under a countdown title, as a person would say it.
 *
 * The big number already says how many days; this says which day, because "12"
 * on its own is a fact you cannot check. Deliberately without the year unless
 * it is not this one — "3 Sep" is how you would answer if someone asked.
 */
function whenLabel(targetAt: string): string {
  const date = new Date(targetAt);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

/** "a year ago" for the first one, then the count. */
function yearAgoLabel(when: string, now: number): string {
  const years = Math.max(1, Math.round((now - Date.parse(when)) / 31_557_600_000));
  return years === 1 ? 'a year ago' : `${years} years ago`;
}

/**
 * Minutes past midnight where the couple lives.
 *
 * `Intl` rather than an offset table, and read out of a formatted string
 * because that is the only way to ask a zone what its wall clock says. An
 * unknown zone answers with UTC rather than throwing: the moment opening an
 * hour out is a small wrong, and Home failing to render is a large one.
 */
function minutesPastMidnightIn(zone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(at);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');
    return hour * 60 + minute;
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}
