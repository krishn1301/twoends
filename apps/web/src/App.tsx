import { useEffect, useState } from 'react';

import { OptionA } from './design/OptionA.tsx';
import { OptionB } from './design/OptionB.tsx';
import { OptionC } from './design/OptionC.tsx';
import { Picker, type OptionId } from './design/Picker.tsx';

/**
 * Phase 0 only routes between three candidate designs, so it routes on the hash
 * and nothing more. Phase 2 introduces real screens and a real router; adding
 * one now would be a dependency chosen before there is anything to route.
 */
function readHash(): OptionId {
  const id = window.location.hash.replace('#/design/', '');
  return id === 'b' || id === 'c' ? id : 'a';
}

export function App() {
  const [option, setOption] = useState<OptionId>(readHash);

  useEffect(() => {
    const onChange = () => setOption(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <>
      {option === 'a' && <OptionA />}
      {option === 'b' && <OptionB />}
      {option === 'c' && <OptionC />}
      <Picker current={option} />
    </>
  );
}
