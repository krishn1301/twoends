import { recapTitle } from '@twoends/core';

/**
 * A month, as one tall PNG.
 *
 * Drawn by hand on a canvas rather than rasterised from the DOM. `html2canvas`
 * is the obvious choice and it was the wrong one here: this app's surfaces are
 * built out of `color-mix(in oklab, …)`, backdrop filters and layered
 * gradients, and that library reimplements CSS rather than using the browser's
 * own painter — so the parts most worth keeping are exactly the parts it gets
 * wrong. It is also a dependency, and this repo already writes a ZIP and PNG
 * chunks by hand for the same reason.
 *
 * What is drawn is therefore not a screenshot of the page. It is a poster made
 * of the same month: the photographs at a decent size, the two answers, and the
 * numbers. Simple enough to be exact.
 */

/** Wide enough to look like a photo on a phone, small enough to share. */
const WIDTH = 1080;

/**
 * The tallest image worth making.
 *
 * A thirty-snap month at full width is over twenty thousand pixels, which most
 * viewers refuse to open and every messaging app re-encodes into mush. Past
 * this the photographs go two to a row, which quarters the height, and past
 * that they are simply cropped to the ones that fit — a shorter poster somebody
 * can open beats a complete one nobody can.
 */
const MAX_HEIGHT = 14_000;

const PAD = 56;
const GAP = 24;

export interface RecapImageInput {
  month: string;
  daysTogether: number;
  daysAnswered: number;
  photos: { url: string; caption: string | null }[];
  closest: { question: string; answers: string[] } | null;
  furthest: { question: string; answers: string[] } | null;
  names: [string, string];
  accents: [string, string];
  mark: string;
}

/**
 * Loads a photograph in a way a canvas will still let you export.
 *
 * `crossOrigin` before `src`, and both matter: a signed Supabase URL is a
 * different origin, and an image drawn without CORS taints the canvas so
 * `toBlob` throws a security error instead of returning anything. One that
 * fails to load is skipped rather than fatal — a poster missing a photo is
 * better than a button that does nothing.
 */
function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/** Greedy wrap. Returns the lines; the caller decides where they go. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';

  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  return lines;
}

export async function drawRecap(input: RecapImageInput): Promise<Blob | null> {
  const images = (await Promise.all(input.photos.map((photo) => load(photo.url)))).filter(
    (image): image is HTMLImageElement => image !== null,
  );

  // Two columns once a single one would run past what anybody will open.
  const columns = images.length > 6 ? 2 : 1;
  const cell = (WIDTH - PAD * 2 - GAP * (columns - 1)) / columns;

  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) return null;

  // ── work out the height before committing to a canvas ─────────────────────
  const heights = images.map((image) => Math.round((cell * image.height) / image.width));

  let gridHeight = 0;
  for (let i = 0; i < heights.length; i += columns) {
    gridHeight += Math.max(...heights.slice(i, i + columns)) + GAP;
  }

  measure.font = `40px Georgia, serif`;
  const quoteLines = [input.closest, input.furthest]
    .filter((q): q is NonNullable<typeof q> => q !== null)
    .map((q) => ({
      question: wrap(measure, q.question, WIDTH - PAD * 2),
      answers: q.answers.map((body) => wrap(measure, body, WIDTH - PAD * 2 - 32)),
    }));

  const quotesHeight = quoteLines.reduce(
    (total, q) =>
      total + q.question.length * 52 + q.answers.flat().length * 44 + q.answers.length * 24 + 72,
    0,
  );

  const headerHeight = 300;
  const footerHeight = 180;
  let height = headerHeight + gridHeight + quotesHeight + footerHeight;

  // Too tall even at two columns: drop photographs off the end until it fits.
  let shown = images.length;
  while (height > MAX_HEIGHT && shown > columns) {
    const row = Math.max(...heights.slice(shown - columns, shown)) + GAP;
    height -= row;
    shown -= columns;
  }

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.max(600, Math.round(height));

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // ── the page ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // A band of the two of them across the top, which is the only place in the
  // export where both colours appear at once.
  const band = ctx.createLinearGradient(0, 0, WIDTH, 220);
  band.addColorStop(0, input.accents[0]);
  band.addColorStop(1, input.accents[1]);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, WIDTH, 8);

  let y = 110;

  ctx.fillStyle = '#F2EDE9';
  ctx.font = '600 64px Georgia, serif';
  ctx.fillText(recapTitle(input.month), PAD, y);

  y += 56;
  ctx.fillStyle = '#948A82';
  ctx.font = '32px system-ui, sans-serif';
  ctx.fillText(
    `${input.names[0]} and ${input.names[1]} · day ${input.daysTogether.toLocaleString('en-GB')}`,
    PAD,
    y,
  );

  y += 44;
  ctx.fillText(
    input.daysAnswered === 1 ? 'One day you both answered' : `${input.daysAnswered} days you both answered`,
    PAD,
    y,
  );

  y = headerHeight;

  // ── the photographs ───────────────────────────────────────────────────────
  for (let i = 0; i < shown; i += columns) {
    const row = images.slice(i, i + columns);
    const tallest = Math.max(...row.map((_, n) => heights[i + n] ?? 0));

    row.forEach((image, n) => {
      const x = PAD + n * (cell + GAP);
      const h = heights[i + n] ?? 0;

      ctx.save();
      roundRect(ctx, x, y, cell, h, 28);
      ctx.clip();
      ctx.drawImage(image, x, y, cell, h);
      ctx.restore();
    });

    y += tallest + GAP;
  }

  // ── what they said ────────────────────────────────────────────────────────
  for (const quote of quoteLines) {
    y += 40;

    ctx.fillStyle = '#948A82';
    ctx.font = '40px Georgia, serif';
    for (const line of quote.question) {
      ctx.fillText(line, PAD, y);
      y += 52;
    }

    y += 12;
    quote.answers.forEach((answer, index) => {
      ctx.fillStyle = input.accents[index] ?? '#F2EDE9';
      ctx.fillRect(PAD, y - 30, 4, answer.length * 44);

      ctx.fillStyle = '#F2EDE9';
      ctx.font = '36px system-ui, sans-serif';
      for (const line of answer) {
        ctx.fillText(line, PAD + 32, y);
        y += 44;
      }
      y += 24;
    });
  }

  // ── the mark ──────────────────────────────────────────────────────────────
  ctx.fillStyle = '#3A322D';
  ctx.font = '28px ui-monospace, monospace';
  ctx.fillText(input.mark, PAD, canvas.height - 60);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
