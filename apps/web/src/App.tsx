import { useEffect, useState } from 'react';

import { Sheet } from './components/Sheet.tsx';
import { TabBar, type TabId } from './components/TabBar.tsx';
import { watchConnectivity } from './db/outbox.ts';
import { pull, subscribe } from './db/repository.ts';
import { Countdowns } from './screens/Countdowns.tsx';
import { Draw } from './screens/Draw.tsx';
import { Home } from './screens/Home.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { Pair } from './screens/Pair.tsx';
import { SaveAccount } from './screens/SaveAccount.tsx';
import { Snap } from './screens/Snap.tsx';
import { SignIn } from './screens/SignIn.tsx';
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
  const [sheet, setSheet] = useState<'draw' | 'snap' | null>(null);
  const [offerDismissed, setOfferDismissed] = useState(() => emailOffered());

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
      // Deliberately blank. A spinner for a session check that usually resolves
      // in under a frame is just a flash of anxiety.
      return <div className="bg-void min-h-full" />;

    case 'signing-in':
      return <SignIn />;

    case 'onboarding':
      return <Onboarding />;

    case 'solo':
      return <Pair />;

    case 'paired':
      // The one moment worth interrupting for: they have just become a pair, so
      // there is finally something worth not losing.
      if (isAnonymous && !offerDismissed) {
        return <SaveAccount onDone={() => setOfferDismissed(true)} />;
      }

      return (
        <>
          {tab === 'home' ? <Home onOpen={setSheet} /> : <Countdowns />}
          {sheet && (
            <Sheet
              title={sheet === 'draw' ? 'Draw them something' : 'Send a snap'}
              onClose={() => setSheet(null)}
            >
              {sheet === 'draw' ? (
                <Draw onSent={() => setSheet(null)} />
              ) : (
                <Snap onSent={() => setSheet(null)} />
              )}
            </Sheet>
          )}
          <TabBar current={tab} onSelect={setTab} />
        </>
      );
  }
}
