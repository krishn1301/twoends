import { useEffect, useRef, useState } from 'react';

import type { Drawing, Point, Stroke } from '@twoends/core';

import { paintStroke } from '../lib/paintStroke.ts';

/**
 * A drawing surface.
 *
 * Pointer events rather than touch or mouse events: one API covers finger,
 * stylus and trackpad, and it is the only one that reports pressure. Where a
 * device does not report it, everything falls back to a constant width rather
 * than to a wobble.
 *
 * Coordinates are normalised 0-1 as they are captured, not when they are saved,
 * so the same drawing renders correctly on a phone, a desktop, and a
 * home-screen widget from a single payload.
 */
export function DrawSurface({
  color,
  erasing = false,
  drawing,
  onStroke,
  readOnly = false,
  className = '',
}: {
  color: string;
  /** Cuts a hole instead of painting, so it works over anything. */
  erasing?: boolean;
  drawing: Drawing;
  /**
   * Fires once per finished stroke, with just that stroke.
   *
   * Emitting the whole drawing instead would force the caller to work out which
   * part is new by index — and that breaks the moment a partner's strokes
   * arrive mid-drawing and renumber everything underneath.
   */
  onStroke?: (stroke: Stroke) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState<Stroke | null>(null);
  const strokeRef = useRef<Stroke | null>(null);

  // Redraw whenever the picture changes. Cheap: a few hundred short lines.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match the backing store to the device's pixels, or a diagonal drawn on a
    // 3x phone screen looks like a staircase.
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== rect.width * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of [...drawing.strokes, ...(live ? [live] : [])]) {
      paintStroke(ctx, stroke, rect.width, rect.height);
    }
  }, [drawing, live]);

  function positionOf(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
      // A mouse reports 0.5 by convention and a finger often reports 0; treat
      // anything falsy as "no pressure information" rather than "no pressure".
      p: event.pressure > 0 ? event.pressure : 0.5,
    };
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (readOnly) return;
    // Capture so a stroke that leaves the canvas mid-drag still ends properly
    // rather than hanging around waiting for a pointerup that never arrives.
    event.currentTarget.setPointerCapture(event.pointerId);

    const stroke: Stroke = {
      color,
      // A wider eraser, because erasing precisely with a fingertip is miserable.
      width: erasing ? 0.05 : 0.012,
      points: [positionOf(event)],
      ...(erasing ? { erase: true } : {}),
    };
    strokeRef.current = stroke;
    setLive(stroke);
  }

  function extend(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = strokeRef.current;
    if (!stroke) return;

    /*
      `getCoalescedEvents` returns the positions the browser batched between
      frames. On a 120Hz display that is the difference between a smooth curve
      and a visibly polygonal one, and it costs nothing — the points already
      exist, they are simply not delivered by default.
    */
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const points = events.length > 0 ? events.map((e) => toPoint(e, event)) : [positionOf(event)];

    stroke.points.push(...points);
    setLive({ ...stroke, points: [...stroke.points] });
  }

  function end() {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    setLive(null);
    if (!stroke || stroke.points.length < 2) return;

    onStroke?.(stroke);
  }

  function toPoint(native: PointerEvent, react: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = react.currentTarget.getBoundingClientRect();
    return {
      x: clamp((native.clientX - rect.left) / rect.width),
      y: clamp((native.clientY - rect.top) / rect.height),
      p: native.pressure > 0 ? native.pressure : 0.5,
    };
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={start}
      onPointerMove={extend}
      onPointerUp={end}
      onPointerCancel={end}
      className={`w-full ${readOnly ? '' : 'cursor-crosshair'} ${className}`}
      // Without this the browser claims the gesture for scrolling and the
      // stroke stops after a few pixels — the single most common way a drawing
      // canvas is broken on a phone.
      style={{ touchAction: 'none' }}
      aria-label={readOnly ? 'A drawing' : 'Drawing area'}
    />
  );
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
