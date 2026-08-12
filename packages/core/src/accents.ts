/**
 * The twelve accents.
 *
 * Each partner has one, and it is how the app says *whose* something is. That
 * matters in places a photograph cannot go: a streak dot, a stroke on the shared
 * canvas, a tint on a card, a widget at 8px. It also works in the first minute,
 * before anyone has uploaded a face.
 *
 * Nobody is asked to pick one. The colour is taken from your profile photo — see
 * `nearestAccent` — so the palette of the app ends up being the two of you
 * rather than a menu someone had to read. It stays changeable in settings for
 * anyone who disagrees with the machine.
 *
 * Every value below is generated and contrast-checked, not eyeballed:
 *
 *  - `onDark`  clears 4.5:1 against black *and* against the card surface
 *  - `onLight` clears 4.5:1 against the paper base
 *
 * Two variants exist because no single mid-tone colour can clear 4.5:1 against
 * both a near-black and a near-white ground — the maths rules it out.
 *
 * The contrast targets are deliberately staggered (4.8 through 10.3) rather than
 * all sitting on 4.5. Solving every hue to the same target makes all twelve
 * identically light, which reads as one colour to a colourblind user even though
 * the hues are far apart. Hues are at least 18 degrees apart for the same
 * reason, from the other direction.
 */

export const ACCENT_KEYS = [
  'rose',
  'coral',
  'amber',
  'citron',
  'moss',
  'fern',
  'teal',
  'sky',
  'cobalt',
  'iris',
  'orchid',
  'fuchsia',
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

export interface Accent {
  key: AccentKey;
  /** Human-facing name, shown in settings. */
  label: string;
  /** Position on the colour wheel, 0-360. Used to match a photo to an accent. */
  hue: number;
  /** Clears 4.5:1 on black and on the card surface. */
  onDark: string;
  /** Clears 4.5:1 on the paper base. */
  onLight: string;
}

export const ACCENTS: Record<AccentKey, Accent> = {
  rose: { key: 'rose', label: 'Rose', hue: 350, onDark: '#e1455f', onLight: '#d32240' },
  coral: { key: 'coral', label: 'Coral', hue: 14, onDark: '#e86c46', onLight: '#c24018' },
  amber: { key: 'amber', label: 'Amber', hue: 32, onDark: '#ed8d20', onLight: '#a05c0d' },
  citron: { key: 'citron', label: 'Citron', hue: 68, onDark: '#acc02d', onLight: '#66721b' },
  moss: { key: 'moss', label: 'Moss', hue: 105, onDark: '#55aa39', onLight: '#3d7a29' },
  fern: { key: 'fern', label: 'Fern', hue: 142, onDark: '#36a25e', onLight: '#297c48' },
  teal: { key: 'teal', label: 'Teal', hue: 178, onDark: '#2fbdb9', onLight: '#1e7976' },
  sky: { key: 'sky', label: 'Sky', hue: 205, onDark: '#1f8cda', onLight: '#1972b1' },
  cobalt: { key: 'cobalt', label: 'Cobalt', hue: 232, onDark: '#6374e3', onLight: '#4c60df' },
  iris: { key: 'iris', label: 'Iris', hue: 262, onDark: '#986ce5', onLight: '#824cdf' },
  orchid: { key: 'orchid', label: 'Orchid', hue: 305, onDark: '#de71d5', onLight: '#b82bac' },
  fuchsia: { key: 'fuchsia', label: 'Fuchsia', hue: 328, onDark: '#e353a0', onLight: '#cc217c' },
};

export function isAccentKey(value: string): value is AccentKey {
  return (ACCENT_KEYS as readonly string[]).includes(value);
}

/** Falls back to `teal` for an unknown key so a bad row never blanks the UI. */
export function getAccent(key: string | null | undefined): Accent {
  return key && isAccentKey(key) ? ACCENTS[key] : ACCENTS.teal;
}

// ── deriving an accent from a photograph ─────────────────────────────────────

/**
 * The accent closest in hue to a colour taken from someone's photo.
 *
 * The photo's own colour is *not* used directly, and that is the point: an
 * arbitrary pixel might be near-black, near-white, or a muddy brown that fails
 * contrast on every surface in the app. Snapping to the palette keeps every
 * guarantee above while still making the choice feel like it came from them.
 *
 * `avoid` lets the second partner land somewhere else when both photos point at
 * the same colour — two people the app renders identically would defeat the
 * entire purpose of having colours.
 */
export function nearestAccent(hue: number, avoid?: AccentKey | null): Accent {
  const wrapped = ((hue % 360) + 360) % 360;

  const ranked = ACCENT_KEYS.map((key) => {
    const distance = Math.abs(((ACCENTS[key].hue - wrapped + 540) % 360) - 180);
    return { key, distance };
  }).sort((a, b) => a.distance - b.distance);

  const pick = ranked.find((candidate) => candidate.key !== avoid) ?? ranked[0]!;
  return ACCENTS[pick.key];
}

/**
 * A colour for someone with no photograph.
 *
 * Deterministic from their id, so it does not change between devices or between
 * sessions, and never lands on the partner's.
 */
export function accentFromId(id: string, avoid?: AccentKey | null): Accent {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return nearestAccent((hash >>> 0) % 360, avoid);
}
