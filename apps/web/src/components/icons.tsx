import { useId } from 'react';

import { screen } from '../lib/blend.ts';

/**
 * SVG icons, not emoji.
 *
 * Both reference apps use emoji as illustration throughout — a flame for the
 * streak, a bouquet for the anniversary, a gift box on every card. It is cheap
 * and it renders differently on every platform, which is exactly the problem:
 * the Samsung emoji set on the S9+ does not match the Apple set in the App
 * Store screenshots. An icon that changes shape per device is not an identity.
 */

export function Flame({ color = 'currentColor' }: { color?: string }) {
  return (
    /*
      Drawn at 16px because that is the only size it is used at. An earlier
      version was a smooth teardrop and read unmistakably as a water drop on the
      device — a flame needs the leaning tip and the notched shoulder to survive
      being this small.
    */
    <svg width="15" height="17" viewBox="0 0 15 17" fill="none" aria-hidden="true">
      <path
        d="M9.4 0.4c.9 2.9-.4 4.3-2 5.8C5.4 8 3.2 9.4 3.2 11.8a4.8 4.8 0 0 0 9.6 0c0-1.7-.7-3-1.6-4.2-.2 1-.7 1.7-1.5 2.1.7-3 .5-6-.3-9.3Z"
        fill={color}
      />
      <path
        d="M5.6 11.4c0 1.3.8 2.3 2 2.7-1.9.3-3.4-.7-3.4-2.3 0-.9.4-1.7 1-2.4.1.8.2 1.4.4 2Z"
        fill={color}
        opacity="0.55"
      />
    </svg>
  );
}

export function Lock() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="6" width="9" height="7" rx="2" fill="currentColor" />
      <path
        d="M3.75 6V4.25a2.25 2.25 0 0 1 4.5 0V6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-7.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12.5c0 3.9-3.6 7-8 7a9 9 0 0 1-2.6-.4L4.5 20.5l1.2-3.4A6.7 6.7 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PairIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="10.5" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19.5c.6-2.7 2.8-4.2 5.5-4.2s4.9 1.5 5.5 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.8 15.5c2.1.2 3.4 1.5 3.9 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlayIcon() {
  return (
    /*
      Two cards, offset, rather than a controller or a die.

      A controller says video game, and a die says chance — neither is what this
      is. The deck is the honest picture: a stack of cards you turn over one at
      a time, which is exactly the interaction.
    */
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3.2"
        y="6.4"
        width="10.4"
        height="13.4"
        rx="2.6"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M8.4 4.2h7.2A3.2 3.2 0 0 1 18.8 7.4v9.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A heart, and the only one in the app.
 *
 * `scripts/icons.mjs` states the position plainly: the mark is deliberately not
 * a heart, because every couple app on the store is one and a heart says nothing
 * about what this one does. That still holds — this is not the mark. It appears
 * in exactly one place, the gap between two faces on the distance widget, where
 * it is not a logo but the thing sitting in the space between two people.
 */
export function Heart({
  from,
  to,
  size = 13,
  className = '',
}: {
  from: string;
  to: string;
  size?: number;
  className?: string;
}) {
  /*
    The colours are props, not CSS variables.

    `theme.css` declares `--mine` and `--theirs` with a comment promising they
    are "overridden per couple once both partners have picked" — and nothing in
    the app has ever set them. A heart drawn from those would have come out teal
    and rose for every couple in the world while looking, in the source, as
    though it were theirs.

    The id has to be unique per instance or two hearts on one screen share the
    first one's gradient — an SVG `defs` id is document-global, not scoped.
  */
  const id = `heart-${from.replace('#', '')}-${to.replace('#', '')}`;

  return (
    <svg
      width={size}
      height={size * 0.92}
      viewBox="0 0 13 12"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6.5 11.2 1.9 6.7A3.1 3.1 0 0 1 6.5 2.5a3.1 3.1 0 0 1 4.6 4.2L6.5 11.2Z"
        fill={`url(#${id})`}
      />
      <defs>
        {/*
          Across the two accents, the same idea as the launcher mark's overlap:
          light is what you get when both are present. A gradient rather than a
          true screen blend, because CSS has no screen blend inside a fill.
        */}
        <linearGradient id={id} x1="0" y1="0" x2="13" y2="12">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
    </svg>
  );
}

/*
  Two overlapping speech bubbles, one in each accent.

  The tile it sits on is the only one in the Today rail that is about both of
  them talking, and it had no illustration at all — it and "Send one back" were
  carrying the identical background and three lines of text each, which is why
  it read as bland rather than as anything.

  Deliberately not a microphone. A microphone is a picture of the equipment; two
  bubbles crossing is a picture of the thing. It is also the app's own mark said
  in a different shape — the launcher icon is two overlapping discs, and the
  lighter part where they cross is the only bit that needs both people to exist.
*/

/** The left bubble, stated once so the fill and the clip cannot disagree. */
const MINE_BODY = { x: 8, y: 10, width: 64, height: 48, rx: 17 };
const MINE_TAIL = 'M28 56 L14 77 L46 56 Z';

const THEIRS_BODY = { x: 48, y: 34, width: 64, height: 48, rx: 17 };
const THEIRS_TAIL = 'M92 80 L106 97 L74 80 Z';

export function Bubbles({
  mine,
  theirs,
  className = '',
}: {
  mine: string;
  theirs: string;
  className?: string;
}) {
  /*
    A clip-path id is global to the document, not to the component. `useId`
    rather than something built from the two colours, because a couple who both
    chose the same accent would otherwise share one id with every other
    instance — the monogram learned this the same way.
  */
  const id = useId();

  return (
    <svg viewBox="0 0 120 100" className={className} fill="none" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <rect {...MINE_BODY} />
          <path d={MINE_TAIL} />
        </clipPath>
      </defs>

      <g fill={mine} opacity="0.85">
        <rect {...MINE_BODY} />
        <path d={MINE_TAIL} />
      </g>

      <g fill={theirs} opacity="0.85">
        <rect {...THEIRS_BODY} />
        <path d={THEIRS_TAIL} />
      </g>

      {/*
        The crossing, in the screen blend of the two — lighter than either side,
        which is the whole idea. Arithmetic rather than `mix-blend-mode`, which
        escapes a rounded clip in Chromium and once painted a black square
        around every avatar on the S9+.
      */}
      <g clipPath={`url(#${id})`} fill={screen(mine, theirs)} opacity="0.92">
        <rect {...THEIRS_BODY} />
      </g>
    </svg>
  );
}
