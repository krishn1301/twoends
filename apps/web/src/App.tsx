import { TabBar } from './components/TabBar.tsx';
import { Home } from './screens/Home.tsx';

/**
 * Phase 0 closed with the Bento direction chosen, so there is nothing left to
 * route between — one screen, rendered directly. Phase 2 brings the onboarding
 * and pairing flows and, with them, a real router.
 */
export function App() {
  return (
    <>
      <Home />
      <TabBar />
    </>
  );
}
