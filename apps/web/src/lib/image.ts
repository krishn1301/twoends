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

  const blob = await toBlob(canvas);
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

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        // Safari only gained WebP encoding in 14; JPEG is the honest fallback
        // and costs perhaps 25% more bytes rather than failing the upload.
        canvas.toBlob(
          (jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('Could not compress the photo.'))),
          'image/jpeg',
          QUALITY,
        );
      },
      'image/webp',
      QUALITY,
    );
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
