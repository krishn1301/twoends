import { getAccent, type DayMark, type Drawing } from '@twoends/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { paintStroke } from './paintStroke.ts';
import { db } from '../db/schema.ts';
import { signedUrls, type Snap } from '../db/photos.ts';
import type { SharedCanvas } from '../db/canvas.ts';

/**
 * Pushing the app's state out to the home screen.
 *
 * The thesis of this whole project is that the other person should feel nearby
 * without either of you opening anything. Every line here exists to serve that,
 * and the direction of travel is one-way on purpose: the app decides everything
 * and the widgets only draw. Nothing native computes a streak, resolves whose
 * turn it is, or decides whether location may be shown.
 *
 * On the web this is all no-ops. The PWA gets the same app with notifications
 * instead of widgets, which is the closest an iPhone allows.
 */

interface WidgetSnapshot {
  myName: string;
  theirName: string;
  myAccent: string;
  theirAccent: string;
  startedOn: string | null;
  streak: number;
  doneToday: boolean;
  /** Seven characters, Monday first. See WidgetStore.Snapshot. */
  week: string;
  countdownTitle: string | null;
  countdownAt: string | null;
  snapFromThem: boolean;
  snapCaption: string | null;
  canvasFromThem: boolean;
  distanceKm: number | null;
  quiet: boolean;
}

interface WidgetsBridge {
  update(options: { snapshot: WidgetSnapshot }): Promise<void>;
  putImage(options: { name: 'snap' | 'canvas'; data: string | null }): Promise<void>;
  clear(): Promise<void>;
}

const Widgets = registerPlugin<WidgetsBridge>('Widgets');

/** Android only. iOS widgets are Phase 8 and need a different bridge entirely. */
export const widgetsSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/**
 * Widget art is deliberately small.
 *
 * A launcher redraws a widget on every home-screen scroll, and each redraw
 * decodes this file. 480px is past what a 4x4 cell can show on the densest
 * phone, and the whole point of the file is that it is cheaper than the photo.
 */
const ART = 480;

/**
 * What the caller has to hand over.
 *
 * Everything is passed in; this module imports no store at all. The stores are
 * what call it, and any import back into `state/` would make a cycle that
 * resolves differently depending on which module the bundler reached first —
 * the kind of bug that shows up only in the production build.
 */
export interface WidgetInput {
  myId: string | null;
  myName: string;
  theirName: string;
  myAccentKey: string;
  theirAccentKey: string;
  coupleId: string;
  startedOn: string | null;
  snaps: Snap[];
  canvas: SharedCanvas | null;
  streak: { current: number };
  week: DayMark[];
}

/**
 * Sends everything the widgets draw.
 *
 * Called from `useShared.load`, which is the one place where the snaps, the
 * canvas and the streak are all in hand at once — and which already runs on
 * mount and whenever the app returns to the foreground.
 */
export async function syncWidgets(input: WidgetInput): Promise<void> {
  if (!widgetsSupported()) return;

  const { snaps, canvas, streak, week, myId } = input;
  const countdown = await nextCountdown(input.coupleId);
  const latest = snaps[0];

  const snapshot: WidgetSnapshot = {
    myName: input.myName,
    theirName: input.theirName,
    myAccent: getAccent(input.myAccentKey).onDark,
    theirAccent: getAccent(input.theirAccentKey).onDark,
    startedOn: input.startedOn,
    streak: streak.current,
    doneToday: week[mondayFirstIndex()] === 'done',
    week: week.map(mark).join(''),
    countdownTitle: countdown?.title ?? null,
    countdownAt: countdown?.target_at ?? null,
    snapFromThem: latest != null && latest.author_id !== myId,
    snapCaption: latest?.caption ?? null,
    canvasFromThem: canvas?.lastAuthorId != null && canvas.lastAuthorId !== myId,
    /*
      Always null for now. Location is opt-in per person and lands in Phase 9;
      until then the widget's locked state is the honest reading, and shipping a
      placeholder number would be worse than shipping none.
    */
    distanceKm: null,
    quiet: false,
  };

  // The snapshot first, so that even if an image fails the numbers are right.
  await Widgets.update({ snapshot });

  await Promise.allSettled([
    Widgets.putImage({ name: 'snap', data: await snapArt(latest) }),
    Widgets.putImage({ name: 'canvas', data: canvasArt(canvas) }),
  ]);
}

/** Called on sign-out and unpair. See WidgetsPlugin.clear. */
export async function clearWidgets(): Promise<void> {
  if (!widgetsSupported()) return;
  try {
    await Widgets.clear();
  } catch {
    // A widget that failed to clear is not a reason to block a sign-out.
  }
}

// ── art ──────────────────────────────────────────────────────────────────────

async function snapArt(snap: Snap | undefined): Promise<string | null> {
  if (!snap) return null;

  try {
    const urls = await signedUrls([snap.storage_path]);
    const url = urls.get(snap.storage_path);
    if (!url) return null;

    const response = await fetch(url);
    if (!response.ok) return null;

    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, ART / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    // Offline, or a signed URL that expired between the list and the fetch.
    // The widget keeps the photo it already has, which is the right outcome.
    return null;
  }
}

/**
 * Renders the shared canvas on transparent, using the app's own stroke painter.
 *
 * Transparent rather than black so the widget's own background shows through —
 * the drawing is a mark on a surface, not a picture of one.
 */
function canvasArt(shared: SharedCanvas | null): string | null {
  const drawing: Drawing | undefined = shared?.drawing;
  if (!drawing || drawing.strokes.length === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = ART;
  canvas.height = ART;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /*
    Strokes carry the colour they were drawn in, and the Draw screen only ever
    hands them an `onDark` accent — every one of which is built to clear 4.5:1
    on black. So a drawing made in the app is already legible on a widget, with
    no recolouring here and no second palette to keep in step.
  */
  for (const stroke of drawing.strokes) {
    paintStroke(ctx, stroke, ART, ART);
  }

  // PNG, not JPEG: the transparency is the point, and a few hundred short
  // strokes compress to less than the photo beside it.
  return canvas.toDataURL('image/png');
}

// ── data ─────────────────────────────────────────────────────────────────────

/** The soonest one still ahead. A countdown to a date that has passed is noise. */
async function nextCountdown(coupleId: string) {
  const now = Date.now();
  const rows = await db.countdowns.where('couple_id').equals(coupleId).toArray();

  return rows
    .filter((row) => Date.parse(row.target_at) >= now - 86_400_000)
    .sort((a, b) => Date.parse(a.target_at) - Date.parse(b.target_at))[0];
}

const mark = (value: DayMark): string =>
  value === 'done' ? 'd' : value === 'grace' ? 'g' : '.';

/** `getDay` is Sunday-first; the week strip and the app are Monday-first. */
const mondayFirstIndex = (): number => (new Date().getDay() + 6) % 7;
