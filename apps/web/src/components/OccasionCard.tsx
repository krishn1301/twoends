import { occasionCopy, type Occasion } from '@twoends/core';

import { Monogram } from './Monogram.tsx';

/**
 * The whole screen, once, on a day that is not an ordinary day.
 *
 * Three of the four occasions get this and the minute does not — see
 * `fillsTheScreen`. A card that took the screen because the clock happened to
 * read 04:16 would interrupt whatever somebody actually opened the app to do,
 * quite possibly mid-sentence in an answer.
 *
 * It is dismissed by tapping anywhere, and the caller records that it has been
 * shown. Nothing is counted and nothing is stored beyond "this one has had its
 * turn": an occasion is a moment, not an achievement, and the app that this one
 * is deliberately not is the one that would give you a badge for it.
 */
export function OccasionCard({
  occasion,
  mine,
  theirs,
  myName,
  theirName,
  myAccent,
  theirAccent,
  onDismiss,
}: {
  occasion: Occasion;
  /** Resolved accent colours, so this need not repeat the lookup. */
  mine: string;
  theirs: string;
  myName: string | null | undefined;
  theirName: string | null | undefined;
  myAccent: string | null | undefined;
  theirAccent: string | null | undefined;
  onDismiss: () => void;
}) {
  const copy = occasionCopy(occasion.kind);

  return (
    <div
      className="fixed inset-0 z-70 flex flex-col items-center justify-center px-8 text-center"
      style={{ background: `linear-gradient(160deg, ${mine}, ${theirs})` }}
    >
      {/*
        The dismissal is the whole surface, and it is a real button underneath so
        that a keyboard and a screen reader can leave too. Nothing else on this
        screen does anything, so there is nothing for a full-bleed button to be
        in the way of.
      */}
      <button
        type="button"
        aria-label="Close"
        onClick={onDismiss}
        className="absolute inset-0"
      />

      <div className="pointer-events-none relative flex flex-col items-center">
        {copy?.eyebrow && (
          <p className="mb-3 text-[0.8rem] tracking-[0.2em] text-white/70 lowercase">
            {copy.eyebrow}
          </p>
        )}

        <h1 className="font-display text-[2.6rem] leading-[1.05] font-semibold tracking-tight text-white">
          {headline(occasion, theirName)}
        </h1>

        {copy && (
          <p className="mt-4 max-w-[20rem] text-[1rem] leading-relaxed text-white/85">{copy.line}</p>
        )}

        <div className="mt-10 opacity-80">
          <Monogram
            mine={myName}
            theirs={theirName}
            myAccent={myAccent}
            theirAccent={theirAccent}
            size={52}
          />
        </div>
      </div>

      <p className="text-ash pointer-events-none absolute bottom-10 text-[0.75rem] text-white/50">
        tap anywhere
      </p>
    </div>
  );
}

/**
 * The one line that is a fact rather than a sentiment.
 *
 * Spelling small numbers and leaving large ones as digits, because "One year" is
 * how somebody says it and "10000 days" is how somebody reads it. The boundary
 * is where the word gets longer than the number.
 */
function headline(occasion: Occasion, theirName: string | null | undefined): string {
  switch (occasion.kind) {
    case 'anniversary':
      return occasion.years === 1 ? 'One year' : `${occasion.years} years`;

    case 'birthday':
      // Named when it is theirs, because that is the useful half — you know when
      // your own is, and the reason to say it is so the other one is reminded.
      if (occasion.whose !== 'theirs') return 'Your birthday';
      return theirName ? `${theirName}’s birthday` : 'Their birthday';

    case 'milestone':
      return `${occasion.days?.toLocaleString('en-GB')} days`;

    default:
      return '';
  }
}
