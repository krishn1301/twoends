/**
 * Two accents, overlapping.
 *
 * `1-(1-a)(1-b)` per channel — the screen blend `scripts/icons.mjs` computes
 * for the launcher mark, and the reason a crossing is lighter than either side
 * of it. Done in arithmetic rather than with `mix-blend-mode`, which escapes a
 * rounded clip in Chromium and has already painted a black square around every
 * avatar on the S9+ once.
 *
 * Its own module because two components need it now — the monogram and the
 * voice bubbles — and a file that exports both a component and a helper loses
 * fast refresh for the component. The same reason `paintStroke.ts` is not part
 * of `DrawSurface`.
 *
 * Both arguments must be `#rrggbb`. Every accent in `packages/core/src/accents`
 * is, and nothing else should be calling this.
 */
export function screen(a: string, b: string): string {
  const channels = [0, 1, 2].map((i) => {
    const x = parseInt(a.slice(1 + i * 2, 3 + i * 2), 16);
    const y = parseInt(b.slice(1 + i * 2, 3 + i * 2), 16);
    return Math.round(255 - ((255 - x) * (255 - y)) / 255);
  });

  return `#${channels.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}
