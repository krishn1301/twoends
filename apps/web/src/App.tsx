import { useEffect, useRef, useState } from 'react';

import { Sheet } from './components/Sheet.tsx';
import { TabBar, type TabId } from './components/TabBar.tsx';
import { watchConnectivity } from './db/outbox.ts';
import { pull, subscribe } from './db/repository.ts';
import { Ask } from './screens/Ask.tsx';
import { Dates } from './screens/Dates.tsx';
import { Draw } from './screens/Draw.tsx';
import { Home } from './screens/Home.tsx';
import { Launch } from './screens/Launch.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { Pair } from './screens/Pair.tsx';
import { Paired } from './screens/Paired.tsx';
import { Play } from './screens/Play.tsx';
import { SaveAccount } from './screens/SaveAccount.tsx';
import { Snaps } from './screens/Snaps.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Us } from './screens/Us.tsx';
import { Monogram } from './components/Monogram.tsx';
import { useIsV2 } from './design/version.ts';
import { VoiceNotes } from './screens/VoiceNotes.tsx';
import { emailOffered } from './state/emailOffer.ts';
import { useSession } from './state/session.ts';

/**
 * The app is a state machine, not a set of URLs, so it renders by status.
 *
 * No sign-in wall: opening the app makes an anonymous account in the background
 * and goes straight to the first question. Email is offered once, after pairing,
 * and is the fire escape rather than the front door.
 */
export function App() {
  const status = useSession((s) => s.status);
  const coupleId = useSession((s) => s.couple?.id);
  const isAnonymous = useSession((s) => s.isAnonymous);
  const bootstrap = useSession((s) => s.bootstrap);

  const [tab, setTab] = useState<TabId>('home');
  const [sheet, setSheet] = useState<'draw' | 'snap' | 'ask' | 'voice' | null>(null);
  const [offerDismissed, setOfferDismissed] = useState(() => emailOffered());

  const v2 = useIsV2();

  /*
    **Item 7.** The pairing reveal is shown to whoever was *waiting* — both
    sides pass through `solo`, the inviter on the code screen and the joiner on
    the one with the field. Somebody opening an app they were already paired in
    goes `loading` -> `paired` and sees nothing, which is right: this marks an
    event, and for them the event happened weeks ago.
  */
  const wasSolo = useRef(false);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (status === 'solo') wasSolo.current = true;
    else if (status === 'paired' && wasSolo.current) {
      wasSolo.current = false;
      setCelebrating(true);
    }
  }, [status]);

  useEffect(() => bootstrap(), [bootstrap]);

  // Sync starts only once there is a couple to sync, and stops when there is
  // not — signing out must not leave a socket open on someone else's data.
  useEffect(() => {
    if (!coupleId) return;

    const stopConnectivity = watchConnectivity();
    const stopRealtime = subscribe(coupleId);
    void pull();

    return () => {
      stopConnectivity();
      stopRealtime();
    };
  }, [coupleId]);

  switch (status) {
    case 'loading':
      /*
        Deliberately blank. A spinner for a session check that usually resolves
        in under a frame is just a flash of anxiety.

        **Item 13** puts the mark here instead — but on a four-hundred
        millisecond delay, so a normal launch still shows nothing at all and
        only a boot slow enough to notice gets anything. The guardrail that
        nothing animates on page load survives: on almost every launch there is
        nothing here to animate.
      */
      return (
        <div className="bg-void grid min-h-full place-items-center">
          {v2 && (
            <span className="patient inline-flex opacity-70">
              <Monogram mine={null} theirs={null} myAccent={null} theirAccent={null} size={72} />
            </span>
          )}
        </div>
      );

    case 'signing-in':
      return <SignIn />;

    case 'onboarding':
      return <Onboarding />;

    case 'solo':
      return <Pair />;

    case 'paired':
      /*
        The reveal comes first, and the email ask after it — which is the half
        of item 7 that can be taken without cost. Moving the ask to "later, some
        quieter time" would also move it to *never* for anyone who does not go
        looking, and an anonymous account with no address on it is one cleared
        browser away from gone. So the moment is no longer spent on a form; it
        is spent on the reveal, and the form is what is waiting afterwards.
      */
      if (v2 && celebrating) {
        return <Paired onDone={() => setCelebrating(false)} />;
      }

      // The one moment worth interrupting for: they have just become a pair, so
      // there is finally something worth not losing.
      if (isAnonymous && !offerDismissed) {
        return <SaveAccount onDone={() => setOfferDismissed(true)} />;
      }

      return (
        <>
          {tab === 'home' && <Home onOpen={setSheet} onGo={setTab} />}
          {tab === 'dates' && <Dates />}
          {tab === 'play' && <Play onGo={setTab} />}
          {tab === 'us' && <Us />}
          {sheet && (
            <Sheet
              title={
                sheet === 'draw'
                  ? 'Your canvas'
                  : sheet === 'ask'
                    ? 'Ask them something'
                    : sheet === 'voice'
                      ? 'Say something'
                      : 'Snaps'
              }
              onClose={() => setSheet(null)}
            >
              {/*
                Neither closes itself on send. The canvas is a place you keep
                drawing, and after sending a snap the natural next thing is to
                look at the pile it just joined.
              */}
              {sheet === 'draw' && <Draw />}
              {sheet === 'snap' && <Snaps />}
              {sheet === 'ask' && <Ask onAsked={() => setSheet(null)} />}
              {/*
                Its own sheet, not a strip under the photographs. A voice note
                is the other half of the same idea rather than a snap with the
                picture missing, and buried under a screen called Snaps nobody
                would find it.
              */}
              {sheet === 'voice' && <VoiceNotes />}
            </Sheet>
          )}
          <TabBar current={tab} onSelect={setTab} />

          {/*
            Last in the tree so it sits over everything, and it removes itself.
            The app behind it is already interactive — this is not a gate.
          */}
          <Launch />
        </>
      );
  }
}
