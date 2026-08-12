/**
 * The colour of a photograph, reduced to a single hue.
 *
 * Used to pick someone's accent from their profile picture, so the palette of
 * the app comes from the two people in it rather than from a menu.
 *
 * The naive version — average every pixel — always returns mud, because
 * averaging opposite hues cancels them. This buckets by hue instead and weights
 * each pixel by how colourful and how well-lit it is, so a red jacket beats a
 * grey wall even when the wall covers most of the frame.
 */

const BUCKETS = 36; // 10 degrees each — finer than the palette needs.
const SAMPLE_EDGE = 48;

export async function dominantHue(source: Blob): Promise<number | null> {
  const bitmap = await createImageBitmap(source);

  const canvas = document.createElement('canvas');
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const weights = new Float64Array(BUCKETS);

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3]!;
    if (alpha < 200) continue;

    const [hue, saturation, lightness] = toHsl(data[i]!, data[i + 1]!, data[i + 2]!);

    /*
      Skip what carries no colour information. Near-black and near-white pixels
      have a hue, technically, but it is noise — and a photo taken indoors is
      mostly those. Skin tones are deliberately not excluded: for a portrait,
      warm is often the honest answer.
    */
    if (saturation < 0.18) continue;
    if (lightness < 0.12 || lightness > 0.94) continue;

    // Colourfulness times how central the lightness is: a washed-out pastel and
    // a nearly-black maroon both count for less than a clear mid-tone.
    const weight = saturation * (1 - Math.abs(lightness - 0.5) * 1.4);
    weights[Math.floor((hue / 360) * BUCKETS) % BUCKETS]! += Math.max(0, weight);
  }

  let best = -1;
  let bestWeight = 0;
  for (let i = 0; i < BUCKETS; i++) {
    // Neighbouring buckets count too, so a hue straddling a boundary is not
    // split in half and beaten by a narrower peak.
    const smoothed =
      weights[(i - 1 + BUCKETS) % BUCKETS]! * 0.5 + weights[i]! + weights[(i + 1) % BUCKETS]! * 0.5;

    if (smoothed > bestWeight) {
      bestWeight = smoothed;
      best = i;
    }
  }

  // A photo of a grey sky, or a very dark room, has no colour to give.
  if (best === -1 || bestWeight <= 0) return null;

  return (best + 0.5) * (360 / BUCKETS);
}

function toHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) return [0, 0, lightness];

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));

  let hue: number;
  if (max === rr) hue = ((gg - bb) / delta) % 6;
  else if (max === gg) hue = (bb - rr) / delta + 2;
  else hue = (rr - gg) / delta + 4;

  hue *= 60;
  if (hue < 0) hue += 360;

  return [hue, saturation, lightness];
}
