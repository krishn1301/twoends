import { describe, expect, it } from 'vitest';

import {
  MAX_STROKES,
  compact,
  emptyDrawing,
  estimateSize,
  isDrawing,
  isEmpty,
  mergeBatches,
  simplify,
  type Point,
  type Stroke,
} from './strokes.ts';

const line = (count: number): Point[] =>
  Array.from({ length: count }, (_, i) => ({ x: i / (count - 1), y: 0.5, p: 0.5 }));

const stroke = (points: Point[]): Stroke => ({ color: '#30c2bd', width: 0.01, points });

describe('simplify', () => {
  it('collapses a straight run to its ends', () => {
    // A finger dragged across a screen emits a point every few milliseconds,
    // nearly all of them sitting on the line between their neighbours.
    expect(simplify(line(50))).toHaveLength(2);
  });

  it('keeps the points that carry the shape', () => {
    const corner: Point[] = [
      { x: 0, y: 0, p: 0.5 },
      { x: 0.5, y: 0, p: 0.5 },
      { x: 0.5, y: 0.5, p: 0.5 },
    ];
    // The corner is the drawing. Losing it would straighten the line.
    expect(simplify(corner)).toHaveLength(3);
  });

  it('leaves very short strokes alone', () => {
    expect(simplify([])).toHaveLength(0);
    expect(simplify(line(2))).toHaveLength(2);
  });
});

describe('compact', () => {
  it('makes a scribble small enough to be free', () => {
    const drawing = {
      version: 1 as const,
      strokes: Array.from({ length: 12 }, () => stroke(line(200))),
    };

    const before = estimateSize(drawing);
    const after = estimateSize(compact(drawing));

    // The whole argument for strokes over bitmaps is the payload.
    expect(after).toBeLessThan(before / 10);
    expect(after).toBeLessThan(4000);
  });

  it('rounds coordinates to sub-pixel precision', () => {
    const drawing = {
      version: 1 as const,
      strokes: [
        stroke([
          { x: 0.123456789, y: 0.987654321, p: 0.5 },
          { x: 0.5, y: 0.5, p: 0.5 },
        ]),
      ],
    };
    const point = compact(drawing).strokes[0]!.points[0]!;
    // Three decimals is under a pixel at 1080px; more is stored noise.
    expect(point.x).toBe(0.123);
    expect(point.y).toBe(0.988);
  });

  it('caps a runaway drawing rather than storing it', () => {
    const drawing = {
      version: 1 as const,
      strokes: Array.from({ length: MAX_STROKES + 50 }, () => stroke(line(3))),
    };
    expect(compact(drawing).strokes).toHaveLength(MAX_STROKES);
  });
});

describe('guards', () => {
  it('recognises an empty drawing', () => {
    expect(isEmpty(emptyDrawing())).toBe(true);
    // A tap is not a drawing: one point cannot be rendered as a line.
    expect(isEmpty({ version: 1, strokes: [stroke([{ x: 0.5, y: 0.5, p: 1 }])] })).toBe(true);
    expect(isEmpty({ version: 1, strokes: [stroke(line(5))] })).toBe(false);
  });

  it('rejects anything that is not a drawing', () => {
    // jsonb holds whatever it was given, including rows written by an older
    // version of the app.
    expect(isDrawing(null)).toBe(false);
    expect(isDrawing('scribble')).toBe(false);
    expect(isDrawing({ version: 99, strokes: [] })).toBe(false);
    expect(isDrawing({ strokes: [] })).toBe(false);
    expect(isDrawing(emptyDrawing())).toBe(true);
  });
});

describe('merging batches into one surface', () => {
  const batch = (n: number, isClear = false) => ({
    drawing: { version: 1 as const, strokes: Array.from({ length: n }, () => stroke(line(3))) },
    isClear,
  });

  it('joins everything both people have drawn', () => {
    expect(mergeBatches([batch(2), batch(3)]).strokes).toHaveLength(5);
  });

  it('starts again after a clear', () => {
    // The tombstone is itself an append, so clearing syncs and cannot race with
    // someone drawing at that moment.
    expect(mergeBatches([batch(5), batch(0, true), batch(2)]).strokes).toHaveLength(2);
  });

  it('uses the most recent clear, not the first', () => {
    const merged = mergeBatches([batch(1), batch(0, true), batch(9), batch(0, true), batch(3)]);
    expect(merged.strokes).toHaveLength(3);
  });

  it('is empty when the last thing that happened was a clear', () => {
    expect(mergeBatches([batch(4), batch(0, true)]).strokes).toHaveLength(0);
  });

  it('handles a canvas nobody has touched', () => {
    expect(mergeBatches([]).strokes).toEqual([]);
  });
});

describe('the eraser', () => {
  it('survives compaction', () => {
    // Losing the flag would silently turn an eraser stroke into a solid line
    // the next time the canvas was read back.
    const drawing = {
      version: 1 as const,
      strokes: [{ ...stroke(line(10)), erase: true }],
    };
    expect(compact(drawing).strokes[0]?.erase).toBe(true);
  });
});
