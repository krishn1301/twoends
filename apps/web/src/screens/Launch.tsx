import { useEffect, useState } from 'react';

import { Monogram } from '../components/Monogram.tsx';
import { possessive } from '../lib/whosePlace.ts';
import { useSession } from '../state/session.ts';

/**
 * The mark, once, when the app opens.
 *
 * The two overlapping circles were only ever shown at the pairing moment and at
 * the foot of Us. The owner saw the pairing one and asked for it on every
 * launch, which is right: it is the best thing in the app and it says whose app
 * this is without a word of interface.
 *
 * **It does not block anything.** The app is already rendered underneath — this
 * is an overlay that fades and removes itself, and it is `pointer-events-none`
 * throughout, so a tap during it lands on whatever is behind. A splash that has
 * to finish before you can use the thing is a loading screen wearing a hat.
 *
 * Once per launch, tracked in a module rather than in state: React mounts twice
 * in development, and a mark that plays twice reads as a stutter.
 */
let played = false;

/** How long it holds before it goes. Matched to `.launch` in `theme.css`. */
const RUNS_FOR = 1900;

export function Launch() {
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const [showing, setShowing] = useState(() => !played);

  useEffect(() => {
    if (played) return;
    played = true;

    const timer = window.setTimeout(() => setShowing(false), RUNS_FOR);
    return () => window.clearTimeout(timer);
  }, []);

  if (!showing) return null;

  const mine = profile?.display_name ?? 'you';
  const theirs = partner?.display_name ?? 'them';

  return (
    <div
      aria-hidden="true"
      className="launch bg-void pointer-events-none fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 px-8"
    >
      <Monogram
        mine={mine}
        theirs={theirs}
        myAccent={profile?.accent_key}
        theirAccent={partner?.accent_key}
        size={128}
      />
      <p className="font-display text-center text-[1.5rem] leading-tight font-semibold tracking-tight">
        {possessive(mine, theirs)}
      </p>
    </div>
  );
}
