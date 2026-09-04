import { useId } from 'react';

import { getAccent } from '@twoends/core';

import { screen } from '../lib/blend.ts';

/**
 * The app's mark, with a letter in each half.
 *
 * The launcher icon has always been two overlapping discs — that *is* the two of
 * you, and the lighter shape where they cross is the only part that needs both
 * of you to exist. Nothing in the app has ever said so out loud. This is the one
 * place it does, drawn in the couple's own two accents rather than in the coral
 * and iris the shipped icon uses, so every pair gets their own version of it.
 *
 * SVG rather than a generated PNG for exactly that reason: `scripts/icons.mjs`
 * bakes two fixed colours at build time, and this has to take two that are only
 * known at runtime.
 *
 * The geometry is the icon's, to the unit — discs of r=22 at x=43 and x=65 on
 * y=54 of a 108 grid. Keeping the numbers identical is what makes this read as
 * the same mark rather than as a similar one.
 */

const R = 22;
const CX_A = 43;
const CX_B = 65;
const CY = 54;

/** The first letter of a name, or nothing rather than a wrong guess. */
const initial = (name: string | null | undefined): string =>
  (name ?? '').trim().charAt(0).toUpperCase();

export function Monogram({
  mine,
  theirs,
  myAccent,
  theirAccent,
  size = 72,
}: {
  mine: string | null | undefined;
  theirs: string | null | undefined;
  myAccent: string | null | undefined;
  theirAccent: string | null | undefined;
  size?: number;
}) {
  const a = getAccent(myAccent).onDark;
  const b = getAccent(theirAccent).onDark;
  const both = screen(a, b);

  const left = initial(mine);
  const right = initial(theirs);

  // A clip path is referenced by id from the document, not from this subtree, so
  // two monograms on one screen would share the first one's. `Us` renders one
  // and the colophon it opens renders another.
  const lens = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 108 108"
      fill="none"
      role="img"
      /*
        Named, because this is the one image in the app carrying a meaning that
        is not written next to it anywhere. A screen reader that says "image"
        here has read out nothing at all.
      */
      aria-label={left && right ? `${left} and ${right}` : 'The TwoEnds mark'}
    >
      <circle cx={CX_A} cy={CY} r={R} fill={a} />
      <circle cx={CX_B} cy={CY} r={R} fill={b} />

      {/*
        The crossing, drawn as one disc clipped by the other. Two clip paths
        rather than a blend mode, and the result is identical to the icon's.
      */}
      <clipPath id={lens}>
        <circle cx={CX_A} cy={CY} r={R} />
      </clipPath>
      <circle cx={CX_B} cy={CY} r={R} fill={both} clipPath={`url(#${lens})`} />

      {/*
        The letters sit in the outer half of each disc, clear of the crossing —
        a letter across that seam would be two colours and legible as neither.
        `Fraunces` because the display face is what the app signs its headlines
        with, and a monogram is a signature.
      */}
      {left && (
        <text
          x={CX_A - R / 2}
          y={CY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(0,0,0,0.55)"
          style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: R,
            fontWeight: 600,
          }}
        >
          {left}
        </text>
      )}
      {right && (
        <text
          x={CX_B + R / 2}
          y={CY}
          textAnchor="middle"
          dominantBaseline="central"
          fill="rgba(0,0,0,0.55)"
          style={{
            fontFamily: 'var(--font-display), Georgia, serif',
            fontSize: R,
            fontWeight: 600,
          }}
        >
          {right}
        </text>
      )}
    </svg>
  );
}
