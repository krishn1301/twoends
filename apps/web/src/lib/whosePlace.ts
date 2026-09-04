/**
 * "Mira and Aditya's place." — the line under the mark on every launch.
 *
 * Its own module rather than a helper beside the component so that it can be
 * tested: the app's test project compiles TypeScript and not TSX, deliberately.
 *
 * Joint possession, so the apostrophe goes on the second name only. A name
 * already ending in s takes the apostrophe alone — "Charles' place", not
 * "Charles's place" — which is the one case that would otherwise read as a typo
 * to the person whose name it is.
 */
export function possessive(mine: string, theirs: string): string {
  const trimmed = theirs.trim();
  const suffix = /s$/i.test(trimmed) ? '’' : '’s';
  return `${mine.trim()} and ${trimmed}${suffix} place.`;
}
