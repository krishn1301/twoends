import { OptionBento } from './design/OptionBento.tsx';

/**
 * Bento won the Phase 0 design decision, so there is nothing left to route
 * between. Phase 2 introduces real screens and a real router; adding one now
 * would be a dependency chosen before there is anything to route.
 */
export function App() {
  return <OptionBento />;
}
