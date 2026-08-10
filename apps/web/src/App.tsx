import { useEffect, useState } from 'react';

import { OptionBento } from './design/OptionBento.tsx';
import { OptionLetter } from './design/OptionLetter.tsx';
import { OptionSplit } from './design/OptionSplit.tsx';
import { Picker, type OptionId } from './design/Picker.tsx';

/**
 * Phase 0 only routes between candidate designs, so it routes on the hash and
 * nothing more. Phase 2 introduces real screens and a real router; adding one
 * now would be a dependency chosen before there is anything to route.
 */
function readHash(): OptionId {
  const id = window.location.hash.replace('#/design/', '');
  return id === 'letter' || id === 'split' ? id : 'bento';
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
      {option === 'bento' && <OptionBento />}
      {option === 'letter' && <OptionLetter />}
      {option === 'split' && <OptionSplit />}
      <Picker current={option} />
    </>
  );
}
