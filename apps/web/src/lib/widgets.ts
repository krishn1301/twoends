import { distanceHeadline, getAccent, type DayMark, type Drawing, type Reading } from '@twoends/core';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { paintStroke } from './paintStroke.ts';
import { db } from '../db/schema.ts';
import { signedAvatarUrls } from '../db/avatars.ts';
import { soonestCountdown } from '../db/repository.ts';
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
  /** When it was added, so the widget can show how far through the wait you are. */
  countdownFrom: string | null;
  snapFromThem: boolean;
  snapCaption: string | null;
  canvasFromThem: boolean;
  /** All three null until both people have location on. See core/distance.ts. */
  distanceLabel: string | null;
  /** The same reading as one heading — "870 km", "same city". */
  distanceTitle: string | null;
  distanceNote: string | null;
  quiet: boolean;
}

/**
 * The six, in the order they are offered.
 *
 * These ids are a contract with `WidgetsPlugin.PROVIDERS` on the Kotlin side.
 * A typo here is a rejected call rather than a wrong widget, which is the
 * failure mode worth having.
 */
export const WIDGETS = [
  { id: 'snaps', name: 'Their latest photo', note: 'Whatever they last sent, full bleed.' },
  { id: 'canvas', name: 'The canvas', note: 'Whatever the two of you drew.' },
  { id: 'anniversary', name: 'Days together', note: 'Counting up, in both your colours.' },
  { id: 'countdown', name: 'The next countdown', note: 'Days until the soonest one.' },
  { id: 'streak', name: 'Streak', note: 'The number and the week so far.' },
  { id: 'distance', name: 'How far apart', note: 'Both your faces, and the gap.' },
  { id: 'distanceStrip', name: 'How far apart, small', note: 'The same, in one row.' },
] as const;

export type WidgetId = (typeof WIDGETS)[number]['id'];

/**
 * The images the native side will accept, contractual with
 * `WidgetsPlugin.ALLOWED_IMAGES`. A name not in this set is rejected rather than
 * written, which is the right way round: a typo becomes a failed call instead of
 * a file nothing ever reads.
 */
export type WidgetImage = 'snap' | 'canvas' | 'avatarMe' | 'avatarThem';

interface WidgetsBridge {
  update(options: { snapshot: WidgetSnapshot }): Promise<void>;
  putImage(options: { name: WidgetImage; data: string | null }): Promise<void>;
  clear(): Promise<void>;
  canPin(): Promise<{ value: boolean }>;
  pin(options: { name: WidgetId }): Promise<{ value: boolean }>;
}

const Widgets = registerPlugin<WidgetsBridge>('Widgets');

/** Android only. iOS widgets are Phase 8 and need a different bridge entirely. */
export const widgetsSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

/**
 * Whether this launcher will let the app offer to place a widget for you.
 *
 * Most will. Some will not, and on those the app has to fall back to telling
 * you where the widget drawer is rather than showing a button that does
 * nothing.
 */
export async function canPinWidgets(): Promise<boolean> {
  if (!widgetsSupported()) return false;
  try {
    return (await Widgets.canPin()).value;
  } catch {
    return false;
  }
}

/**
 * Asks the launcher to put one widget on the home screen.
 *
 * The reason this exists at all: the widgets are why there is an APK, and the
 * only route to them was "long-press the home screen, find Widgets, scroll to
 * TwoEnds, press and hold, drag". Every step in that sentence is somewhere to
 * give up, and it was reported here as the feature simply not being there.
 *
 * The launcher shows its own confirmation, which is correct — an app able to
 * silently add things to your home screen would be a worse thing to install.
 * So `true` means "the launcher was asked", never "a widget now exists".
 */
export async function pinWidget(id: WidgetId): Promise<boolean> {
  if (!widgetsSupported()) return false;
  try {
    return (await Widgets.pin({ name: id })).value;
  } catch {
    return false;
  }
}

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
  /**
   * Already phrased by `readDistance`. A kilometre figure is deliberately not
   * passed: the widget process is never given a distance it could turn back
   * into a position, and the rounding rules exist in one place only.
   */
  distance: Reading;
  /**
   * Both faces, as storage paths.
   *
   * Paths, not URLs, and they go no further than this module: the bitmap is
   * fetched here and pushed as bytes. A path must never enter the snapshot —
   * that is written to SharedPreferences, which is durable and survives longer
   * than anyone expects, and a durable pointer at a private bucket buys nothing.
   */
  myAvatarPath: string | null;
  theirAvatarPath: string | null;
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
  const hasFix = input.distance.km !== null;

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
    countdownFrom: countdown?.created_at ?? null,
    snapFromThem: latest != null && latest.author_id !== myId,
    snapCaption: latest?.caption ?? null,
    canvasFromThem: canvas?.lastAuthorId != null && canvas.lastAuthorId !== myId,
    /*
      Null unless there is a real reading. `off` and `stale` both mean the widget
      should draw its locked state — "no recent location" is not something worth
      a home-screen tile, and it is indistinguishable to a reader from a number
      that has simply stopped changing.
    */
    distanceLabel: hasFix ? input.distance.label : null,
    distanceTitle: hasFix ? distanceHeadline(input.distance) : null,
    distanceNote: hasFix ? input.distance.note : null,
    quiet: false,
  };

  // The snapshot first, so that even if an image fails the numbers are right.
  await Widgets.update({ snapshot });

  await Promise.allSettled([
    pushImage('snap', await snapArt(latest)),
    pushImage('canvas', canvasArt(canvas)),
    pushFaces(input.myAvatarPath, input.theirAvatarPath),
  ]);
}

/**
 * The two faces, at most once per launch.
 *
 * `syncWidgets` runs on every foreground and after every send. Avatars change
 * about twice a year, so re-signing and re-encoding them on that schedule would
 * be pure waste — but there is no way to ask the native side what it is already
 * holding, so the honest ceiling is "once per app launch". This map is empty on
 * a cold start and that is deliberate: a launch costs two nine-kilobyte pushes
 * and guarantees the home screen is not showing a face from a previous account.
 */
const pushedFaces = new Map<WidgetImage, string | null>();

async function pushFaces(myPath: string | null, theirPath: string | null): Promise<void> {
  const wanted: Array<[WidgetImage, string | null]> = [
    ['avatarMe', myPath],
    ['avatarThem', theirPath],
  ];

  const stale = wanted.filter(([name, path]) => pushedFaces.get(name) !== path);
  if (stale.length === 0) return;

  // One signing call for both, not one each. `signedAvatarUrls` already drops
  // falsy paths and returns an empty map for an empty list, so the unpaired case
  // costs nothing.
  const urls = await signedAvatarUrls(stale.map(([, path]) => path).filter(Boolean) as string[]);

  for (const [name, path] of stale) {
    const art = await avatarArt(path ? urls.get(path) : undefined, path);
    if (art === undefined) continue;

    await pushImage(name, art);
    // Recorded only on a push that actually happened, so a failure is retried on
    // the next foreground rather than being remembered as done.
    pushedFaces.set(name, path);
  }
}

/**
 * Sends one image, or deliberately does not.
 *
 * `putImage(name, null)` **deletes** the file — which is right when the thing is
 * genuinely gone, and was catastrophic when it also meant "the fetch failed".
 * `snapArt` returned null on any error, so every foreground without signal wiped
 * the photo off the home screen, under a comment claiming the widget kept what
 * it had. It did not.
 *
 * So the three cases are three values now:
 *
 *  - `string`    — here is the image, write it
 *  - `null`      — there is no such image any more, delete it
 *  - `undefined` — could not fetch it; leave whatever is on disk alone
 *
 * The last one is the whole point. A stale photo is a better home screen than an
 * empty one, and offline is the normal case for a phone, not the exception.
 */
async function pushImage(name: WidgetImage, data: string | null | undefined): Promise<void> {
  if (data === undefined) return;
  await Widgets.putImage({ name, data });
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

/**
 * The latest snap, downscaled.
 *
 * Returns `null` only when there is genuinely no snap — which is the one case
 * where the widget *should* go back to its empty state. Every failure returns
 * `undefined` so the photo already on the home screen survives. See `pushImage`.
 */
async function snapArt(snap: Snap | undefined): Promise<string | null | undefined> {
  if (!snap) return null;

  try {
    const urls = await signedUrls([snap.storage_path]);
    const url = urls.get(snap.storage_path);
    if (!url) return undefined;

    const response = await fetch(url);
    if (!response.ok) return undefined;

    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, ART / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    // Offline, or a signed URL that expired between the list and the fetch.
    return undefined;
  }
}

/**
 * One face, square and small.
 *
 * 192px because the largest circle any widget draws is about 64dp, and the
 * bitmaps are built at three times dp. The avatar in storage is already capped
 * at 512 by `AVATAR_MAX_EDGE`, so this is a second downscale of something small
 * — about nine kilobytes of base64 once encoded.
 *
 * Cropped square here rather than in Kotlin so the bytes that cross the bridge
 * are the bytes that get drawn; `avatarBitmap` masks the circle out of it.
 */
const FACE_ART = 192;

async function avatarArt(
  url: string | undefined,
  path: string | null,
): Promise<string | null | undefined> {
  // No photo at all — delete whatever is there, so removing your picture in Us
  // puts the letter back on the home screen rather than leaving a ghost.
  if (!path) return null;
  if (!url) return undefined;

  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;

    const bitmap = await createImageBitmap(await response.blob());
    const edge = Math.min(bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = FACE_ART;
    canvas.height = FACE_ART;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(
      bitmap,
      (bitmap.width - edge) / 2,
      (bitmap.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      FACE_ART,
      FACE_ART,
    );
    bitmap.close();

    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return undefined;
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

/**
 * The soonest one still ahead. A countdown to a date that has passed is noise.
 *
 * The choosing lives in `repository.ts` so that the widget and Home cannot
 * disagree about which countdown is "the next one" — they were two copies of
 * the same three lines, which is exactly how a widget ends up counting down to
 * something the app has already moved past.
 */
async function nextCountdown(coupleId: string) {
  return soonestCountdown(await db.countdowns.where('couple_id').equals(coupleId).toArray());
}

const mark = (value: DayMark): string =>
  value === 'done' ? 'd' : value === 'grace' ? 'g' : '.';

/** `getDay` is Sunday-first; the week strip and the app are Monday-first. */
const mondayFirstIndex = (): number => (new Date().getDay() + 6) % 7;
