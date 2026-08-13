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
export declare const ACCENT_KEYS: readonly ["rose", "coral", "amber", "citron", "moss", "fern", "teal", "sky", "cobalt", "iris", "orchid", "fuchsia"];
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
export declare const ACCENTS: Record<AccentKey, Accent>;
export declare function isAccentKey(value: string): value is AccentKey;
/** Falls back to `teal` for an unknown key so a bad row never blanks the UI. */
export declare function getAccent(key: string | null | undefined): Accent;
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
export declare function nearestAccent(hue: number, avoid?: AccentKey | null): Accent;
/**
 * A colour for someone with no photograph.
 *
 * Deterministic from their id, so it does not change between devices or between
 * sessions, and never lands on the partner's.
 */
export declare function accentFromId(id: string, avoid?: AccentKey | null): Accent;
//# sourceMappingURL=accents.d.ts.map