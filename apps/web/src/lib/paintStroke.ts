import type { Stroke } from '@twoends/core';

/**
 * Paints one stroke onto a 2D context.
 *
 * Its own module rather than a second export from `DrawSurface`, because the
 * widget bridge renders offscreen with no component involved — and a file that
 * exports both a component and a helper loses fast refresh for the component.
 *
 * There must be exactly one implementation of this. A second renderer written
 * for the widget would have to agree on pressure, width and the eraser's
 * compositing mode forever, and would drift the first time either changed.
 */
export function paintStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number,
) {
  if (stroke.points.length < 2) return;

  /*
    `destination-out` removes what is already painted rather than covering it in
    a background colour. That is what lets the eraser work over a tint, a photo
    or any theme — and what keeps the canvas transparent, so the surface behind
    it shows through instead of a grey rectangle.
  */
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.color;

  // One segment per pair so pressure can vary along the stroke. Drawing the
  // whole path at once would force a single width for the entire line.
  for (let i = 1; i < stroke.points.length; i++) {
    const from = stroke.points[i - 1]!;
    const to = stroke.points[i]!;

    ctx.lineWidth = stroke.width * width * (0.6 + to.p * 0.8);
    ctx.beginPath();
    ctx.moveTo(from.x * width, from.y * height);
    ctx.lineTo(to.x * width, to.y * height);
    ctx.stroke();
  }

  // Left set, the next stroke would erase too.
  ctx.globalCompositeOperation = 'source-over';
}
