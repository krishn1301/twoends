import type { ReactNode } from 'react';

import { Avatar } from '@twoends/ui';

import { useIsV2 } from '../design/version.ts';

/**
 * What a screen looks like before anybody has done anything to it.
 *
 * **Item 3 of the visual review.** Six screens shared one shape — an accent
 * button, one grey sentence, then four or five hundred pixels of pure black to
 * the tab bar. Nothing anywhere showed what the screen looks like once it has
 * something in it, and empty is a new couple's entire first week.
 *
 * So a ghosted example of a filled entry sits above the sentence: a memory with
 * a date and both faces, a sealed capsule with a lock and a future date, an
 * empty snap frame. Dimmed and masked out toward the bottom, which is what
 * keeps it reading as an illustration rather than as a row somebody could tap —
 * and it is `aria-hidden` and `pointer-events-none`, because a screen reader
 * being told about three memories that do not exist would be worse than the
 * black.
 *
 * The copy is untouched. It was already good; it was on its own.
 *
 * In the original look this renders its children and nothing else, so a screen
 * can wrap its empty state unconditionally and the two versions stay identical
 * where they are meant to.
 */
export function Empty({ ghost, children }: { ghost: ReactNode; children: ReactNode }) {
  const v2 = useIsV2();
  if (!v2) return <>{children}</>;

  return (
    <div>
      <div
        aria-hidden="true"
        className="pointer-events-none mb-4 [mask-image:linear-gradient(to_bottom,black_35%,transparent)] select-none"
        style={{ opacity: 0.5 }}
      >
        {ghost}
      </div>
      {children}
    </div>
  );
}

/**
 * The two of you, at the size these ghosts use them.
 *
 * Both accents, always — the point of the illustration is that this is a thing
 * two people fill in, and one avatar would read as a screen about you.
 */
export function GhostFaces({ mine, theirs }: { mine: string; theirs: string }) {
  return (
    <span className="flex -space-x-2">
      <Avatar name="A" accent={theirs} size={20} />
      <Avatar name="B" accent={mine} size={20} />
    </span>
  );
}

/** A row that would be a countdown. */
export function GhostCountdown({ chrome }: { chrome: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {[
        ['12', 'Your trip'],
        ['48', 'Her birthday'],
      ].map(([days, title]) => (
        <li key={title} className="bg-surface lift flex items-center gap-4 rounded-3xl px-5 py-4">
          <span className="counter text-2xl leading-none" style={{ color: chrome }}>
            {days}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{title}</span>
            <span className="text-ash text-sm">{days} days</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A row that would be a memory, dated, with both of you on it. */
export function GhostMemory({ mine, theirs }: { mine: string; theirs: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {['The last morning of it', 'Nothing happened, which was the point'].map((line) => (
        <li key={line} className="bg-surface lift rounded-3xl px-5 py-4">
          <div className="flex items-center gap-2.5">
            <GhostFaces mine={mine} theirs={theirs} />
            <span className="text-ash text-xs">a Sunday</span>
          </div>
          <p className="mt-2 text-[0.95rem] leading-relaxed">{line}</p>
        </li>
      ))}
    </ul>
  );
}

/** A row that would be something on the list. */
export function GhostList({ chrome }: { chrome: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {['Somewhere neither of us has been', 'The film you keep describing'].map((line) => (
        <li key={line} className="bg-surface lift flex items-center gap-3.5 rounded-3xl px-5 py-4">
          <span
            className="h-5 w-5 shrink-0 rounded-full border"
            style={{ borderColor: chrome }}
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[0.95rem]">{line}</span>
        </li>
      ))}
    </ul>
  );
}

/** A capsule, sealed, with a date it opens on. */
export function GhostCapsule({ mine, theirs }: { mine: string; theirs: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {['opens on your anniversary', 'opens in 92 days'].map((when, i) => (
        <li key={when} className="bg-surface lift flex items-center gap-4 rounded-3xl px-5 py-4">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
            style={{
              background: `color-mix(in oklab, ${i === 0 ? mine : theirs} 24%, transparent)`,
            }}
            aria-hidden="true"
          >
            <Padlock />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">Sealed</span>
            <span className="text-ash text-sm">{when}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** An empty frame, at the shape a snap actually arrives in. */
export function GhostSnap({ mine, theirs }: { mine: string; theirs: string }) {
  return (
    <figure className="bg-surface lift overflow-hidden rounded-[28px]">
      <div
        className="grid h-44 w-full place-items-center"
        style={{
          background: `linear-gradient(150deg, color-mix(in oklab, ${theirs} 22%, var(--color-surface)), color-mix(in oklab, ${mine} 22%, var(--color-surface)))`,
        }}
      >
        <Frame />
      </div>
      <figcaption className="flex items-center gap-2.5 px-5 py-4">
        <GhostFaces mine={mine} theirs={theirs} />
        <span className="text-ash text-sm">what you are looking at, right now</span>
      </figcaption>
    </figure>
  );
}

function Padlock() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function Frame() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="3"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="1.4"
      />
      <circle cx="12" cy="12" r="3.2" stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />
    </svg>
  );
}
