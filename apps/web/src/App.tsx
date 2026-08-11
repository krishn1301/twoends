import { useEffect } from 'react';

import { TabBar } from './components/TabBar.tsx';
import { Home } from './screens/Home.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { Pair } from './screens/Pair.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { useSession } from './state/session.ts';

/**
 * The app is a state machine, not a set of URLs, so it renders by status.
 *
 * No router yet: onboarding keeps its own step index, and the one link that
 * matters — an invite — is read straight off `location.search`. A router earns
 * its place in Phase 9, when there are screens worth linking to.
 */
export function App() {
  const status = useSession((s) => s.status);
  const bootstrap = useSession((s) => s.bootstrap);

  useEffect(() => bootstrap(), [bootstrap]);

  switch (status) {
    case 'loading':
      // Deliberately blank. A spinner for a session check that usually resolves
      // in under a frame is just a flash of anxiety.
      return <div className="bg-void min-h-full" />;

    case 'signed-out':
      return <SignIn />;

    case 'onboarding':
      return <Onboarding />;

    case 'solo':
      return <Pair />;

    case 'paired':
      return (
        <>
          <Home />
          <TabBar />
        </>
      );
  }
}
