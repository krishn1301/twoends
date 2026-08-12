/**
 * Shrinking a photograph before it ever leaves the phone.
 *
 * This is the single most important function in the project's running costs.
 * The free tier is 1 GB of storage and 5 GB of egress a month; a modern phone
 * photo is 3-5 MB, so uploading originals would fill it in roughly 250 photos —
 * about nine pairs for a year, and that is before anyone looks at them twice.
 *
 * At 1600px and WebP quality 0.75 the same photo lands around 200 KB, which is
 * 20 times cheaper and, on a 5.8" phone screen or a home-screen widget, visually
 * identical. `docs/COSTS.md` has the arithmetic.
 *
 * The original is never uploaded. That is a project rule, not a preference.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.75;

export interface Shrunk {
  blob: Blob;
  width: number;
  height: number;
  /** What the file would have cost at full size, for the sake of honesty. */
  originalBytes: number;
}

export async function shrinkForUpload(file: File): Promise<Shrunk> {
  const bitmap = await loadBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the photo on this device.');

  // Better downscaling than the default on a large reduction, which is exactly
  // the case here — phone camera to 1600px is usually a 2-3x shrink.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  // `close` matters on a phone: an ImageBitmap of a 12MP photo is ~48MB of
  // uncompressed pixels, and Safari will not collect it promptly on its own.
  if ('close' in bitmap) bitmap.close();

  let blob = await toBlob(canvas);

  /*
    A backstop. Nothing at 1600px encoded as WebP or JPEG should exceed this, so
    if it does, something about the encoder is not behaving as assumed — which
    has already happened once. Re-encoding harder costs a little quality and
    protects the storage budget, which is the thing that keeps this app free.
  */
  if (blob.size > 700_000) {
    const smaller = await encode(canvas, 'image/jpeg', 0.6);
    if (smaller && smaller.size < blob.size) blob = smaller;
  }

  return { blob, width, height, originalBytes: file.size };
}

async function loadBitmap(file: File): Promise<ImageBitmap> {
  /*
    `createImageBitmap` honours EXIF orientation with this option, so photos
    taken sideways are not stored sideways. Without it, every landscape photo
    from an iPhone arrives rotated and there is no way to tell after the fact.
  */
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Older Safari lacks the option; decoding via an <img> applies orientation
    // itself, so the fallback is not worse, only slower.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      await img.decode();
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

const encode = (canvas: HTMLCanvasElement, type: string, quality = QUALITY): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Encodes to WebP, or to JPEG where WebP cannot be written.
 *
 * The trap, and it is a nasty one: `canvas.toBlob` does **not** return null for
 * an unsupported format. The spec says the browser falls back to `image/png` —
 * so asking iOS Safari for WebP quietly returns a PNG, a null-check never fires,
 * and a 200 KB photo ships as a 3 MB one. That happened: five real uploads
 * landed at 2.5-3.1 MB each, named `.jpg`, actually PNG. Twenty times the cost,
 * on the only device the app is really used on.
 *
 * So the returned type is checked rather than the returned value. PNG is never
 * accepted here — for a photograph it is the worst possible choice, being
 * lossless and therefore enormous.
 */
async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const webp = await encode(canvas, 'image/webp');
  if (webp?.type === 'image/webp') return webp;

  const jpeg = await encode(canvas, 'image/jpeg');
  if (jpeg?.type === 'image/jpeg') return jpeg;

  throw new Error('Could not compress the photo on this device.');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
