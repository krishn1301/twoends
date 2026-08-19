#!/usr/bin/env node
/**
 * Draws the picture of each widget that the launcher's picker shows.
 *
 * Until this existed, all seven providers pointed `previewImage` at
 * `@mipmap/ic_launcher`, so opening the widget drawer showed the TwoEnds icon
 * seven times over seven one-line descriptions. Both reference apps show a
 * rendered mockup of the widget itself, and that is most of why theirs look
 * finished and ours looked like nothing had been made yet.
 *
 * `android:previewLayout` would render the real composable and need none of
 * this — it is API 31, and the phone this is built for is 29.
 *
 * These are mockups, not screenshots: the geometry is written twice, once in
 * `Marks.kt` and once here. That is a real cost and the reason the numbers below
 * carry the same names as the Kotlin ones. When a mark changes shape, both move.
 *
 * The two photo widgets stand in with the app's own abstract gradient rather
 * than stock photography — `packages/ui/src/media.tsx` rules that out by design,
 * and a picker tile should show a photo-shaped thing without inventing a couple.
 */
import { fileURLToPath } from 'node:url';

import { png, write } from './lib/png.mjs';
import { signatureText } from './lib/signature.mjs';
import { drawText, textWidth } from './lib/tinyfont.mjs';

/** Read once — the file does not change between the seven images. */
const SIGNATURE = signatureText();

const RES = fileURLToPath(
  new URL('../apps/web/android/app/src/main/res/drawable-nodpi/', import.meta.url),
);

/*
  Coral and iris, the pair `icons.mjs` uses, straight out of accents.ts. Using
  the same two everywhere means the picker, the launcher icon and the favicon are
  visibly one product rather than three that happen to share a name.
*/
const CORAL = [0xe8, 0x6c, 0x46];
const IRIS = [0x98, 0x6c, 0xe5];
const SURFACE = [0x15, 0x12, 0x0f];
const CHALK = [0xf3, 0xed, 0xe7];
const ASH = [0x94, 0x8a, 0x82];

/** The screen blend, the same formula as `lens` in Marks.kt and icons.mjs. */
const lens = (a, b) => a.map((x, i) => 255 - ((255 - x) * (255 - b[i])) / 255);

/** `color-mix(accent 18%, #15120F)`, matching `tint` in Theme.kt. */
const tint = (accent, strength = 0.18) =>
  SURFACE.map((c, i) => Math.round(c + (accent[i] - c) * strength));

// ── a canvas ─────────────────────────────────────────────────────────────────

/**
 * Four samples per axis, sixteen per pixel.
 *
 * Circles and a heart are the shapes where aliasing is unmissable, and these are
 * shown at about 130px wide in the picker. Supersampling is the entire
 * anti-aliasing implementation, exactly as in `icons.mjs`.
 */
const SS = 3;

function surface(width, height) {
  const px = Buffer.alloc(width * height * 4);

  const blend = (x, y, colour, alpha) => {
    if (alpha <= 0 || x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (Math.floor(y) * width + Math.floor(x)) * 4;
    const a = Math.min(1, alpha);
    for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c] * (1 - a) + colour[c] * a);
    px[i + 3] = Math.round(px[i + 3] * (1 - a) + 255 * a);
  };

  /**
   * Fills every pixel whose supersampled centre satisfies `inside`.
   *
   * `bounds` is not an optimisation detail, it is the difference between this
   * script taking three seconds and taking three minutes: without it, drawing a
   * glyph one dot at a time scans the entire canvas per dot, and a line of text
   * is a few hundred dots. Shapes that know where they are should say so.
   */
  const shape = (inside, colourAt, bounds) => {
    const x0 = Math.max(0, Math.floor(bounds?.[0] ?? 0));
    const y0 = Math.max(0, Math.floor(bounds?.[1] ?? 0));
    const x1 = Math.min(width, Math.ceil(bounds?.[2] ?? width));
    const y1 = Math.min(height, Math.ceil(bounds?.[3] ?? height));

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            if (inside(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS)) hits++;
          }
        }
        if (hits > 0) blend(x, y, colourAt(x, y), hits / (SS * SS));
      }
    }
  };

  return { px, blend, shape, width, height };
}

const roundRect = (x0, y0, x1, y1, r) => (x, y) => {
  if (x < x0 || y < y0 || x > x1 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return Math.hypot(x - cx, y - cy) <= r || (x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r);
};

const disc = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) <= r;

/**
 * Two lobes and a triangle, the same construction as `heartPath` in Marks.kt.
 *
 * The first version of both used a rotated square instead, which at
 * `half = r * 1.42` is wide enough to swallow the circles whole — so what it
 * actually drew was a rounded diamond. Rendering it large here is what exposed
 * it; at twenty pixels on a widget, a bad heart and a good one both read as a
 * small pink blob.
 */
const heart = (cx, cy, size) => {
  const r = size / 4;
  const top = cy - r * 0.55;
  const tip = cy + size * 0.42;

  return (x, y) => {
    if (Math.hypot(x - (cx - r), y - top) <= r) return true;
    if (Math.hypot(x - (cx + r), y - top) <= r) return true;
    if (y < top || y > tip) return false;
    // The triangle, as a width that closes linearly from the lobes to the point.
    const half = 2 * r * (1 - (y - top) / (tip - top));
    return Math.abs(x - cx) <= half;
  };
};

// ── the pieces every preview shares ──────────────────────────────────────────

const RADIUS = 24;

function card(width, height, ground) {
  const s = surface(width, height);
  const fill =
    typeof ground === 'function' ? ground : () => ground;
  s.shape(roundRect(0, 0, width - 1, height - 1, RADIUS), fill);
  return s;
}

/**
 * Type, softened.
 *
 * A 5x7 bitmap font stamped at scale is unmistakably pixel art, and the widgets
 * it is standing in for use the system sans. Rendering each glyph pixel as a
 * small disc rather than a square rounds the corners just enough that at picker
 * size it reads as text rather than as a deliberate retro effect. It is not a
 * real typeface and does not pretend to be — but the previews are mockups, and a
 * mockup that shouts about its own rendering is doing the wrong job.
 */
function label(s, text, x, y, scale, colour) {
  const dots = [];
  drawText(text, x, y, scale, (px, py) => dots.push([px, py]));

  const r = scale <= 3 ? 0.5 : 0.62;
  for (const [px, py] of dots) {
    s.shape(
      (sx, sy) => Math.abs(sx - (px + 0.5)) <= r && Math.abs(sy - (py + 0.5)) <= r,
      () => colour,
      [px - 1, py - 1, px + 2, py + 2],
    );
  }
}

/** A face: the accent disc, its darker fall, and the initial. */
function faceAt(s, cx, cy, r, accent, initial) {
  s.shape(disc(cx, cy, r), (x, y) => {
    const t = ((x - (cx - r)) / (2 * r) + (y - (cy - r)) / (2 * r)) / 2;
    return accent.map((c) => Math.round(c * (1 - t * 0.58) + 0x24 * t * 0.58));
  });

  const scale = Math.max(1, Math.round(r / 5));
  const w = textWidth(initial, scale);
  label(s, initial, cx - w / 2, cy - (7 * scale) / 2, scale, CHALK);
}

/** Two faces and what sits between them. */
function pairMark(s, cx, cy, r, style) {
  if (style === 'together') {
    const overlap = r * 0.44;
    faceAt(s, cx + r - overlap / 2, cy, r, IRIS, 's');
    faceAt(s, cx - r + overlap / 2, cy, r, CORAL, 'a');
    return;
  }

  const spread = r * 3.4;
  const size = r * 1.24;
  const gap = size * 0.62;

  const line = (x0, x1) => (x, y) => x >= x0 && x <= x1 && Math.abs(y - cy) <= 1.4;
  s.shape(line(cx - spread + r, cx - gap), () => ASH);
  s.shape(line(cx + gap, cx + spread - r), () => ASH);

  s.shape(heart(cx, cy, size), () => lens(CORAL, IRIS));

  faceAt(s, cx - spread, cy, r, CORAL, 'a');
  faceAt(s, cx + spread, cy, r, IRIS, 's');
}

// ── the seven ────────────────────────────────────────────────────────────────

const SIZES = { wide: [420, 210], square: [420, 330] };

const previews = {
  /*
    Distance, the one that was asked for: the figure across the top, both faces
    underneath, a heart in the gap between them.
  */
  distance: () => {
    const [w, h] = SIZES.square;
    const s = card(w, h, tint(IRIS));
    label(s, 'apart', (w - textWidth('apart', 3)) / 2, 58, 3, IRIS);
    label(s, '1150 km', (w - textWidth('1150 km', 7)) / 2, 92, 7, IRIS);
    pairMark(s, w / 2, 226, 30, 'apart');
    return png(s.px, w, h, { text: SIGNATURE });
  },

  distanceStrip: () => {
    const [w, h] = SIZES.wide;
    const s = card(w, h, tint(IRIS));
    pairMark(s, 128, h / 2, 22, 'apart');
    label(s, 'apart', 232, 78, 3, IRIS);
    label(s, '1150', 232, 104, 6, IRIS);
    return png(s.px, w, h, { text: SIGNATURE });
  },

  /* The one surface that is both accents at once. */
  anniversary: () => {
    const [w, h] = SIZES.wide;
    const s = card(w, h, (x, y) => {
      const t = (x / w + y / h) / 2;
      return CORAL.map((c, i) => Math.round(c + (IRIS[i] - c) * t));
    });
    label(s, 'together', 42, 60, 3, CHALK);
    label(s, '412', 42, 92, 9, CHALK);
    label(s, 'days', 42, 162, 3, CHALK);
    pairMark(s, 318, 150, 30, 'together');
    return png(s.px, w, h, { text: SIGNATURE });
  },

  countdown: () => {
    const [w, h] = SIZES.wide;
    const s = card(w, h, tint(IRIS));
    label(s, 'countdown', 42, 52, 3, IRIS);
    label(s, '12', 42, 82, 9, IRIS);
    label(s, 'days · venice', 42, 152, 3, CHALK);
    // The rule: how far through the wait you are.
    s.shape(roundRect(42, 178, w - 42, 186, 4), () => [0x33, 0x30, 0x2d]);
    s.shape(roundRect(42, 178, 42 + (w - 84) * 0.68, 186, 4), () => IRIS);
    return png(s.px, w, h, { text: SIGNATURE });
  },

  streak: () => {
    const [w, h] = SIZES.square;
    const s = card(w, h, tint(CORAL));
    pairMark(s, w / 2, 96, 28, 'together');
    label(s, 'streak', 42, 158, 3, CORAL);
    for (let i = 0; i < 7; i++) {
      const cx = 56 + i * 46;
      if (i < 5) s.shape(disc(cx, 202, 15), () => CORAL);
      else if (i === 5) s.shape(disc(cx, 202, 15), () => [0x33, 0x30, 0x2d]);
      else s.shape(disc(cx, 202, 15), () => [0x2a, 0x27, 0x25]);
    }
    label(s, '5', 42, 240, 8, CORAL);
    label(s, 'days', 90, 268, 3, ASH);
    return png(s.px, w, h, { text: SIGNATURE });
  },

  /*
    The photo widgets stand in with the app's own placeholder gradient. Never
    stock photography — media.tsx rules it out, and a picker tile that invents a
    couple is a small lie about what you are installing.
  */
  snaps: () => {
    const [w, h] = SIZES.square;
    const s = card(w, h, (x, y) => {
      const t = (x / w) * 0.6 + (y / h) * 0.4;
      const from = [0xe8, 0xb4, 0x8a];
      const to = [0x33, 0x23, 0x2e];
      return from.map((c, i) => Math.round(c + (to[i] - c) * t));
    });
    // The scrim the real widget draws under its caption.
    for (let y = Math.round(h * 0.5); y < h; y++) {
      const a = ((y - h * 0.5) / (h * 0.5)) * 0.84;
      for (let x = 0; x < w; x++) s.blend(x, y, [0, 0, 0], a);
    }
    faceAt(s, w - 52, 52, 26, IRIS, 's');
    label(s, 'sam', 42, h - 92, 3, IRIS);
    label(s, 'the view from here', 42, h - 62, 4, CHALK);
    return png(s.px, w, h, { text: SIGNATURE });
  },

  canvas: () => {
    const [w, h] = SIZES.square;
    const s = card(w, h, tint(IRIS));
    label(s, 'sam drew', 42, 46, 3, IRIS);
    // A drawn heart, the mark a person would actually make on a shared canvas.
    const stroke = heart(w / 2, 190, 150);
    const inner = heart(w / 2, 190, 150 - 22);
    s.shape((x, y) => stroke(x, y) && !inner(x, y), () => IRIS);
    faceAt(s, w - 52, 52, 26, IRIS, 's');
    return png(s.px, w, h, { text: SIGNATURE });
  },
};

console.log('widget previews');
for (const [id, draw] of Object.entries(previews)) {
  write(RES, `widget_preview_${id.toLowerCase()}.png`, draw());
}
