/**
 * Thirty seconds of somebody's voice.
 *
 * The cap is the feature. A voice note with no ceiling becomes a thing you put
 * off until you have something worth saying, and then never send; half a minute
 * is short enough that nobody rehearses it. It is enforced here rather than in
 * the UI so there is one place it can be true.
 *
 * No transcription and no read receipts, deliberately. Both turn a thing you
 * said into a thing that can be checked.
 */

/** Hard stop. The column allows a second over, for rounding. */
export const MAX_MS = 30_000;

/** How many bars the waveform is drawn from. */
export const PEAKS = 48;

export interface Recording {
  blob: Blob;
  durationMs: number;
  /** One 0–1 peak per bar, sampled evenly across the clip. */
  peaks: number[];
}

export type RecorderFailure = 'denied' | 'no-microphone' | 'unsupported' | 'failed';

/**
 * What this browser can both record and play, best first.
 *
 * mp4 leads. Where a browser can do both, AAC in mp4 is the one every other
 * browser can also open — and a note recorded on an iPhone has to be playable
 * on an Android phone, which is the entire point of there being two of them.
 */
const CANDIDATES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
] as const;

/**
 * Whether this browser can *play back* a container it says it can record.
 *
 * This is the whole of the bug that made voice notes silent. `isTypeSupported`
 * answers "can I record this", and nothing was asking the other question — so a
 * browser that reports WebM as recordable and cannot decode it produced a file
 * that uploaded fine, showed a waveform, and played nothing. The recording was
 * never the broken part.
 *
 * Safari is the one that does this, and it is also the one most of the people
 * this app is for are on. Which is why mp4 is first in the list now: where both
 * work it is the more portable of the two, and a note recorded on an iPhone has
 * to be playable on an Android phone as well.
 */
function canPlay(type: string): boolean {
  if (typeof document === 'undefined') return true;

  const probe = document.createElement('audio');
  // `canPlayType` wants the bare container for a reliable answer; a codecs
  // parameter it does not recognise makes it say "" even for one it can play.
  const base = type.split(';')[0]!;
  return probe.canPlayType(base) !== '';
}

export function pickFormat(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;

  for (const type of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type) && canPlay(type)) return type;
  }

  /*
    Nothing this browser can both record and play. Recording anyway would give
    somebody a note they can see and not hear, which is worse than not offering
    it — the composer renders nothing at all when this returns null.
  */
  return null;
}

export const canRecord = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.getUserMedia !== undefined &&
  pickFormat() !== null;

export interface LiveRecorder {
  /** Peaks so far, for drawing while it runs. */
  readonly peaks: number[];
  /** Milliseconds elapsed. */
  readonly elapsed: number;
  /** Stops early and resolves with what was captured. */
  stop: () => Promise<Recording | null>;
  /** Throws it away and releases the microphone. */
  cancel: () => void;
}

/**
 * Starts recording, or says why it could not.
 *
 * The permission path is the one that matters: a refused microphone must leave
 * the rest of the composer working and say what happened, rather than
 * presenting a dead button. `NotAllowedError` is a refusal, `NotFoundError` is
 * a device with no microphone at all, and the two want different sentences.
 */
export async function startRecording(
  onTick: (elapsed: number, peaks: number[]) => void,
): Promise<LiveRecorder | RecorderFailure> {
  const mimeType = pickFormat();
  if (!mimeType) return 'unsupported';

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-microphone';
    return 'failed';
  }

  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch {
    for (const track of stream.getTracks()) track.stop();
    return 'unsupported';
  }

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  /*
    The shape, sampled while it runs.

    Drawn from the live analyser rather than decoded afterwards: decoding a clip
    to draw its waveform costs more than fetching it, and the shape somebody
    watched while they were speaking is the honest one to show back to them.
  */
  const audio = new AudioContext();
  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const buffer = new Uint8Array(analyser.frequencyBinCount);
  const peaks: number[] = [];
  const started = performance.now();
  let frame = 0;
  let stopped = false;

  const sampleEvery = MAX_MS / PEAKS;
  let nextSampleAt = 0;

  const tick = () => {
    if (stopped) return;

    const elapsed = performance.now() - started;
    analyser.getByteTimeDomainData(buffer);

    // Peak deviation from the centre line, which is what a waveform is.
    let loudest = 0;
    for (const value of buffer) loudest = Math.max(loudest, Math.abs(value - 128) / 128);

    if (elapsed >= nextSampleAt) {
      peaks.push(Math.min(1, loudest * 1.6));
      nextSampleAt += sampleEvery;
    }

    onTick(Math.min(elapsed, MAX_MS), peaks);

    if (elapsed >= MAX_MS) {
      // The cap, enforced here so the UI cannot forget it.
      if (recorder.state === 'recording') recorder.stop();
      return;
    }

    frame = requestAnimationFrame(tick);
  };

  const release = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    for (const track of stream.getTracks()) track.stop();
    void audio.close().catch(() => undefined);
  };

  const finished = new Promise<Recording | null>((resolve) => {
    recorder.onstop = () => {
      const durationMs = Math.min(MAX_MS, Math.round(performance.now() - started));
      release();

      if (chunks.length === 0 || durationMs < 400) {
        // A tap rather than a hold. Nothing worth sending, and nothing worth
        // an error message either.
        resolve(null);
        return;
      }

      resolve({ blob: new Blob(chunks, { type: mimeType }), durationMs, peaks: even(peaks) });
    };
  });

  /*
    No timeslice, deliberately.

    `start(250)` asks for the file in quarter-second pieces, and Safari answers
    with fragments of an mp4 rather than slices of a finished one — glued back
    together they upload fine, draw a waveform, and will not decode. That is the
    whole of why a note recorded on an iPhone played nowhere, including on the
    iPhone that recorded it. Nothing here ever wanted the pieces: the waveform
    is drawn from the analyser, not from the chunks, so asking for one blob at
    the end costs nothing and is the only form Safari writes correctly.
  */
  recorder.start();
  frame = requestAnimationFrame(tick);

  return {
    get peaks() {
      return peaks;
    },
    get elapsed() {
      return Math.min(performance.now() - started, MAX_MS);
    },
    stop: () => {
      if (recorder.state === 'recording') recorder.stop();
      return finished;
    },
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state === 'recording') recorder.stop();
      release();
    },
  };
}

/**
 * Exactly `PEAKS` bars, whatever was captured.
 *
 * A five-second clip samples eight times and a thirty-second one forty-eight,
 * and a waveform whose bar count depends on how long you spoke reads as a bug.
 * Short clips are stretched; nothing is ever squeezed, because the sampler
 * cannot overshoot.
 */
export function even(raw: number[]): number[] {
  if (raw.length === 0) return new Array<number>(PEAKS).fill(0);
  if (raw.length >= PEAKS) return raw.slice(0, PEAKS);

  return Array.from({ length: PEAKS }, (_, index) => {
    const at = (index / (PEAKS - 1)) * (raw.length - 1);
    const low = Math.floor(at);
    const high = Math.min(raw.length - 1, low + 1);
    const mix = at - low;
    return (raw[low] ?? 0) * (1 - mix) + (raw[high] ?? 0) * mix;
  });
}

/** "0:07" — the only time format a thirty-second clip needs. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `0:${String(seconds).padStart(2, '0')}`;
}
