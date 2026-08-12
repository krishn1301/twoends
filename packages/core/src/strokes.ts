/**
 * Drawings, stored as strokes rather than pixels.
 *
 * A 1080-square PNG of a scribble is 100-300 KB. The same scribble as a list of
 * points is under 2 KB, and 2 KB is a rounding error against a storage budget
 * that photographs are already straining. That alone would justify it.
 *
 * But strokes buy things a bitmap cannot: undo that removes a line rather than
 * repainting a region, replay so a drawing can arrive stroke by stroke on the
 * other person's screen, and re-rendering at any size — the same drawing on a
 * phone and on a home-screen widget, both sharp, from one payload.
 */

export interface Point {
  /** Normalised 0-1, so a drawing made on a phone renders on a widget. */
  x: number;
  y: number;
  /** 0-1. Stylus pressure where the device reports it, otherwise 0.5. */
  p: number;
}

export interface Stroke {
  color: string;
  /** Fraction of the canvas width, so thickness scales with the surface too. */
  width: number;
  points: Point[];
}

/** What lands in the `canvases.strokes` jsonb column. */
export interface Drawing {
  version: 1;
  strokes: Stroke[];
}

export const MAX_STROKES = 400;
export const MAX_POINTS_PER_STROKE = 600;

export function emptyDrawing(): Drawing {
  return { version: 1, strokes: [] };
}

/**
 * Drops points that add nothing.
 *
 * A finger dragged across a phone screen produces a point every few
 * milliseconds, most of them within a hair of the line between their
 * neighbours. Keeping them costs payload and buys nothing a human eye can see.
 *
 * Ramer-Douglas-Peucker, which keeps the points that carry the shape — corners
 * and curves — and discards the ones that merely sit on a straight run.
 */
export function simplify(points: readonly Point[], tolerance = 0.002): Point[] {
  if (points.length < 3) return [...points];

  let maxDistance = 0;
  let index = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i]!, first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= tolerance) return [first, last];

  return [
    ...simplify(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(index), tolerance),
  ];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);

  const t = Math.max(
    0,
    Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSquared),
  );

  return Math.hypot(point.x - (lineStart.x + t * dx), point.y - (lineStart.y + t * dy));
}

/** Rounds coordinates before storage. Three decimals is sub-pixel at 1080px. */
export function compact(drawing: Drawing): Drawing {
  return {
    version: 1,
    strokes: drawing.strokes.slice(-MAX_STROKES).map((stroke) => ({
      ...stroke,
      points: simplify(stroke.points)
        .slice(0, MAX_POINTS_PER_STROKE)
        .map((point) => ({
          x: round(point.x),
          y: round(point.y),
          p: Math.round(point.p * 10) / 10,
        })),
    })),
  };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Rough byte cost, for deciding whether a drawing is worth sending. */
export function estimateSize(drawing: Drawing): number {
  return JSON.stringify(drawing).length;
}

export function isEmpty(drawing: Drawing): boolean {
  return drawing.strokes.every((s) => s.points.length < 2);
}

/**
 * Whether a parsed value is a drawing we can render.
 *
 * Worth checking: this comes out of a jsonb column, which will hold whatever it
 * was given, including something written by an older version of the app.
 */
export function isDrawing(value: unknown): value is Drawing {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Drawing>;
  return candidate.version === 1 && Array.isArray(candidate.strokes);
}
