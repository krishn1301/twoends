/**
 * The eight accents. Each partner picks one at pairing; `accent_key` in the
 * profiles table stores the key, never the hex — so the palette can be retuned
 * later without a migration.
 *
 * Every value below is generated and contrast-checked, not eyeballed:
 *
 *  - `onDark`  clears 4.5:1 against `--ink` (#141110)
 *  - `onLight` clears 4.5:1 against the paper base (#F4EFEA)
 *
 * Two variants exist because no single mid-tone colour can clear 4.5:1 against
 * both a near-black and a near-white background — the maths rules it out. Pick
 * the variant that matches the surface you are drawing on.
 *
 * The contrast targets are deliberately staggered (4.6 through 9.5) rather than
 * all sitting on 4.5. Solving every hue to the same target makes all eight
 * identically light, which reads as one colour to a colourblind user even though
 * the hues are far apart.
 *
 * Rule that follows from that: colour never carries meaning alone. Whose thing
 * this is must also be legible from position, label, or the seam — see
 * docs/PRIVACY.md's sibling rule for why we never rely on a single channel.
 */

export const ACCENT_KEYS = [
  'rose',
  'amber',
  'citron',
  'fern',
  'teal',
  'sky',
  'iris',
  'orchid',
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

export interface Accent {
  key: AccentKey;
  /** Human-facing name shown in the swatch picker. */
  label: string;
  /** Clears 4.5:1 on --ink (#141110). */
  onDark: string;
  /** Clears 4.5:1 on the paper base (#F4EFEA). */
  onLight: string;
}

export const ACCENTS: Record<AccentKey, Accent> = {
  rose: { key: 'rose', label: 'Rose', onDark: '#e4566e', onLight: '#d32240' },
  amber: { key: 'amber', label: 'Amber', onDark: '#ed8f24', onLight: '#a05c0d' },
  citron: { key: 'citron', label: 'Citron', onDark: '#aec22e', onLight: '#66721b' },
  fern: { key: 'fern', label: 'Fern', onDark: '#39ac63', onLight: '#297a47' },
  teal: { key: 'teal', label: 'Teal', onDark: '#30c2bd', onLight: '#1e7875' },
  sky: { key: 'sky', label: 'Sky', onDark: '#2b95e1', onLight: '#1971b0' },
  iris: { key: 'iris', label: 'Iris', onDark: '#9465e4', onLight: '#814bdf' },
  orchid: { key: 'orchid', label: 'Orchid', onDark: '#df77d6', onLight: '#ba2cae' },
};

export function isAccentKey(value: string): value is AccentKey {
  return (ACCENT_KEYS as readonly string[]).includes(value);
}

/** Falls back to `iris` for an unknown key so a bad row never blanks the UI. */
export function getAccent(key: string): Accent {
  return isAccentKey(key) ? ACCENTS[key] : ACCENTS.iris;
}
