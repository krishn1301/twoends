/**
 * A 5x7 bitmap font, because the previews have words in them.
 *
 * The widget previews in the launcher's picker have to show real text — "1150
 * km", "together", "streak" — or they are wireframes rather than pictures of the
 * product. Nothing else in this repo rasterises type, and pulling in a font
 * library plus a TTF to draw about forty distinct glyphs at one size would cost
 * more than it buys.
 *
 * Each glyph is five columns of seven bits, written bottom-bit-is-top. The rows
 * below are readable on purpose: a `#` is on, a `.` is off, and a glyph that
 * looks wrong in the source looks wrong on screen the same way.
 *
 * This is not a text engine. No kerning, no hinting, one weight. It is used at
 * two sizes in one file and should not grow a third customer without someone
 * asking whether the answer is really a font.
 */

const GLYPHS = {
  a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  b: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '####.'],
  c: ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  d: ['....#', '....#', '.##.#', '#..##', '#...#', '#...#', '.####'],
  e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.####'],
  f: ['..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '.#...'],
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  h: ['#....', '#....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  i: ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  j: ['...#.', '.....', '..##.', '...#.', '...#.', '#..#.', '.##..'],
  k: ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..##'],
  l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  m: ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  n: ['.....', '.....', '#.##.', '##..#', '#...#', '#...#', '#...#'],
  o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  p: ['.....', '.....', '####.', '#...#', '####.', '#....', '#....'],
  q: ['.....', '.....', '.####', '#...#', '.####', '....#', '....#'],
  r: ['.....', '.....', '#.###', '##...', '#....', '#....', '#....'],
  s: ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  t: ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.'],
  u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  v: ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  w: ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  y: ['.....', '.....', '#...#', '#...#', '.####', '....#', '.###.'],
  z: ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  '—': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

/**
 * Width in source pixels of a string at a given scale, tracking included.
 *
 * Exposed so a caller can centre a line without rendering it twice.
 */
export function textWidth(text, scale, tracking = 1) {
  const chars = [...text.toLowerCase()];
  if (chars.length === 0) return 0;
  return chars.length * (GLYPH_W + tracking) * scale - tracking * scale;
}

/**
 * Stamps a string into an RGBA buffer.
 *
 * `plot(x, y, alpha)` is called per source pixel rather than writing directly,
 * so the caller owns compositing — the previews draw type over gradients and
 * over photographs, and each wants a different blend.
 */
export function drawText(text, x, y, scale, plot, tracking = 1) {
  let cursor = x;

  for (const char of [...text.toLowerCase()]) {
    const glyph = GLYPHS[char] ?? GLYPHS[' '];

    for (let row = 0; row < GLYPH_H; row++) {
      for (let col = 0; col < GLYPH_W; col++) {
        if (glyph[row][col] !== '#') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            plot(cursor + col * scale + sx, y + row * scale + sy, 1);
          }
        }
      }
    }

    cursor += (GLYPH_W + tracking) * scale;
  }

  return cursor - tracking * scale;
}
