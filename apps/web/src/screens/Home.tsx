import { Avatar, Faces, Pill, Rail, Scribble, Section, Snapshot, Tile } from '@twoends/ui';

import { DrawSurface } from '../components/DrawSurface.tsx';

import { useEffect } from 'react';

import { DailyCard } from '../components/DailyCard.tsx';
import { Flame, Lock } from '../components/icons.tsx';
import { WEEK_LABELS, pad, useDesignModel } from '../design/model.ts';
import { widgetsSupported } from '../lib/widgets.ts';
import { useAvatars } from '../state/avatars.ts';
import { useDistanceReading, useLocation } from '../state/location.ts';
import { useSession } from '../state/session.ts';
import { useShared } from '../state/shared.ts';

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
export function Home({ onOpen }: { onOpen?: (what: 'draw' | 'snap' | 'ask') => void }) {
  const m = useDesignModel();
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const avatarUrls = useAvatars((s) => s.urls);
  const loadAvatars = useAvatars((s) => s.load);
  const loadLocation = useLocation((s) => s.load);
  const distance = useDistanceReading(partner?.display_name);
  const { snaps, urls, canvas, streak, week, load } = useShared();

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

  const latestSnap = snaps[0];
  const latestSnapUrl = latestSnap ? urls.get(latestSnap.storage_path) : undefined;
  const hasDrawing = (canvas?.drawing.strokes.length ?? 0) > 0;
  const theirsLatest = canvas?.lastAuthorId != null && canvas.lastAuthorId !== m.myId;

  // Android, in the installed app. A PWA on Android has no widgets either, and
  // this correctly says so.
  const hasWidgets = widgetsSupported();

  const mine = m.myAccent.onDark;
  const theirs = m.theirAccent.onDark;
  const shared = `linear-gradient(145deg, ${mine}, ${theirs})`;

  return (
    <div className="bg-void text-chalk min-h-full">
      <div className="mx-auto max-w-md pt-4 pb-32">
        <header className="mb-6 flex items-center justify-between px-5">
          <span className="font-display text-2xl leading-none font-semibold tracking-tight">
            twoends
          </span>
          <span
            className="bg-surface-2 counter flex items-center gap-1.5 rounded-full px-3 py-2 text-sm"
            title={`${streak.current} day streak — two missed days a month are forgiven`}
          >
            <Flame color={mine} />
            {streak.current}
          </span>
        </header>

        {/* The pair, before anything else. */}
        <div className="rise mb-6 px-5">
          <Faces
            myName={m.myName}
            myAccent={mine}
            mySrc={profile?.avatar_path ? avatarUrls.get(profile.avatar_path) : null}
            theirName={m.theirName}
            theirAccent={theirs}
            theirSrc={partner?.avatar_path ? avatarUrls.get(partner.avatar_path) : null}
            lineColor="#3A322D"
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
                  <span className="counter" style={{ color: mine }}>
                    {distance.label}
                  </span>
                  {distance.kind === 'apart' && <span className="text-ash">km</span>}
                </span>
              )
            }
          />
        </div>

        {/* The one thing the screen is asking for — real data, not a fixture. */}
        <div className="rise mb-9 px-5" style={{ animationDelay: '60ms' }}>
          <DailyCard onAsk={() => onOpen?.('ask')} />
        </div>

        <div className="flex flex-col gap-9">
          <div className="rise" style={{ animationDelay: '120ms' }}>
            <Section title="Today" action="All">
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
                    ground={`color-mix(in oklab, ${mine} 18%, #15120F)`}
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

                <Tile
                  ground={`color-mix(in oklab, ${mine} 18%, #15120F)`}
                  eyebrow="your turn"
                  headline="Send one back"
                  badge={<Pill>you</Pill>}
                  onClick={() => onOpen?.('snap')}
                />
              </Rail>
            </Section>
          </div>

          <div className="rise" style={{ animationDelay: '180ms' }}>
            <Section title="Together" action="All">
              <Rail>
                <Tile wide ground={shared} eyebrow="anniversary">
                  <div className="absolute inset-x-4 top-1/2 -translate-y-[60%]">
                    <p className="counter text-[1.9rem] leading-none font-medium text-white">
                      {m.elapsed.days}
                      <span className="opacity-50">:</span>
                      {pad(m.elapsed.hours)}
                      <span className="opacity-50">:</span>
                      {pad(m.elapsed.minutes)}
                      <span className="opacity-50">:</span>
                      {pad(m.elapsed.seconds)}
                    </p>
                    <p className="mt-2 flex gap-[2.1rem] text-[0.6rem] tracking-[0.2em] text-white/70 uppercase">
                      <span>day</span>
                      <span>hr</span>
                      <span>min</span>
                      <span>sec</span>
                    </p>
                  </div>
                </Tile>

                <Tile eyebrow="countdown" headline={m.countdownTitle}>
                  <Snapshot seed={3} className="h-full w-full" />
                  <span
                    className="absolute inset-0"
                    style={{
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.1))',
                    }}
                    aria-hidden="true"
                  />
                  <p className="counter absolute top-3.5 right-4 text-[2.2rem] leading-none font-medium text-white">
                    {m.countdownDays}
                  </p>
                </Tile>

                <Tile
                  eyebrow="this week"
                  headline={streak.current === 0 ? 'No streak yet' : `${streak.current} days`}
                >
                  <div className="absolute inset-x-3.5 top-4 grid grid-cols-4 gap-1.5">
                    {week.map((mark, i) => (
                      <span
                        key={WEEK_LABELS[i]}
                        className="grid h-7 w-7 place-items-center rounded-full text-[0.6rem]"
                        style={
                          mark === 'done'
                            ? { background: mine, color: '#000' }
                            : mark === 'grace'
                              ? { border: `1px dashed ${theirs}`, color: '#948A82' }
                              : { background: 'rgba(255,255,255,0.07)', color: '#948A82' }
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
                <Tile
                  eyebrow={distance.kind === 'apart' ? 'apart' : 'distance'}
                  headline={distance.note}
                >
                  <div className="absolute inset-x-4 top-4 flex items-center">
                    <Avatar name={m.myName} accent={mine} size={28} />
                    <span className="mx-1.5 flex-1 border-t border-dashed border-white/25" />
                    <Avatar name={m.theirName} accent={theirs} size={28} />
                  </div>
                  <p
                    className="counter absolute right-4 bottom-14 text-[1.6rem] leading-none font-medium"
                    style={{ color: distance.km === null ? '#948A82' : mine }}
                  >
                    {distance.label}
                  </p>
                </Tile>
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
          {!hasWidgets && (
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
          )}

          {hasWidgets && (
            <div className="rise" style={{ animationDelay: '240ms' }}>
              <Section title="Widgets" action="All">
                <Rail>
                <Tile eyebrow="daily photo" headline="Live pics on their home screen">
                  <Snapshot seed={1} className="h-full w-full" />
                  <span
                    className="absolute inset-x-0 bottom-0 h-3/5"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)' }}
                    aria-hidden="true"
                  />
                </Tile>

                <Tile eyebrow="canvas" headline="Draw them something">
                  <div className="absolute inset-x-4 top-3 bottom-16">
                    <Scribble color={mine} className="h-full w-full" />
                  </div>
                </Tile>

                <Tile eyebrow="distance apart" headline="How far, never where">
                  <div className="absolute inset-x-4 top-8 flex items-center">
                    <Avatar name={m.myName} accent={mine} size={30} />
                    <span className="mx-1.5 flex-1 border-t border-dashed border-white/25" />
                    <Avatar name={m.theirName} accent={theirs} size={30} />
                  </div>
                </Tile>

                <Tile ground={shared} eyebrow="anniversary" headline="Time together, ticking" />
                </Rail>
              </Section>
            </div>
          )}

          {/* Where both reference apps put the paywall. */}
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
        </div>
      </div>
    </div>
  );
}
