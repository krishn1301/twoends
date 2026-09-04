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
 *
 * **There is no `MediaRecorder` in here any more, and that is the fix for the
 * bug that made this feature useless.** Safari writes a *fragmented* MP4 —
 * `ftyp iso5 / moov / moof / mdat`, confirmed by pulling a real recording off
 * the bucket and walking its boxes — and Safari's own `<audio>` element cannot
 * play a fragmented MP4 progressively; that needs MediaSource. So an iPhone
 * produced a 172KB file it could not play back, on the phone that recorded it,
 * with `MEDIA_ERR_SRC_NOT_SUPPORTED`. Dropping the timeslice made it one
 * fragment instead of thirty and changed nothing, because one fragment is
 * still a fragment.
 *
 * Two people, two platforms, one file that has to open on both. The only
 * container every browser can write *and* read without a dependency is the
 * oldest one: PCM in a WAV, assembled here by hand. It is bigger than Opus and
 * that is the whole cost — sixteen kilohertz mono is 32KB a second, so the
 * thirty-second ceiling is also a one-megabyte ceiling, and a note somebody
 * actually sends is a fifth of that.
 */

/** Hard stop. The column allows a second over, for rounding. */
export const MAX_MS = 30_000;

/** How many bars the waveform is drawn from. */
export const PEAKS = 48;

/**
 * Speech, not music.
 *
 * 16kHz keeps every consonant that makes a voice intelligible — it is above
 * what a phone call gives you — and costs a third of what the microphone's
 * native 48kHz would. Nothing said in thirty seconds is worth four times the
 * bytes.
 */
export const SAMPLE_RATE = 16_000;

/** The one format every browser in this couple can both write and read. */
export const AUDIO_TYPE = 'audio/wav';

export interface Recording {
  blob: Blob;
  durationMs: number;
  /** One 0–1 peak per bar, sampled evenly across the clip. */
  peaks: number[];
}

export type RecorderFailure = 'denied' | 'no-microphone' | 'unsupported' | 'failed';

type AudioContextCtor = typeof AudioContext;

function audioContext(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export const canRecord = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.getUserMedia !== undefined &&
  audioContext() !== null;

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
  const Ctor = audioContext();
  if (!Ctor || navigator.mediaDevices?.getUserMedia === undefined) return 'unsupported';

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'no-microphone';
    return 'failed';
  }

  const release = (): void => {
    for (const track of stream.getTracks()) track.stop();
  };

  let audio: AudioContext;
  try {
    audio = new Ctor();
  } catch {
    release();
    return 'failed';
  }

  /*
    iOS hands you a suspended context even inside a gesture. Resuming is a
    promise nobody can await here without delaying the first syllable, so it is
    fired and forgotten — the processor produces nothing until it lands, which
    is a few milliseconds.
  */
  void audio.resume().catch(() => undefined);

  const source = audio.createMediaStreamSource(stream);

  /*
    `createScriptProcessor` is deprecated in favour of an AudioWorklet, and it
    is still the right call here. A worklet is a second file fetched over the
    network before the microphone can start, for a node that lives at most
    thirty seconds and does one `Float32Array` copy per block. Every browser
    this app runs on supports it, iOS Safari included.
  */
  const processor = audio.createScriptProcessor(4096, 1, 1);

  const rate = audio.sampleRate;
  const maxSamples = Math.ceil((MAX_MS / 1000) * rate);

  const blocks: Float32Array[] = [];
  let captured = 0;
  let stopped = false;

  const peaks: number[] = [];
  const samplesPerPeak = maxSamples / PEAKS;
  let nextPeakAt = 0;
  let loudest = 0;

  processor.onaudioprocess = (event) => {
    if (stopped) return;

    const input = event.inputBuffer.getChannelData(0);
    // The engine reuses that buffer, so it has to be copied rather than kept.
    blocks.push(new Float32Array(input));
    captured += input.length;

    for (const value of input) loudest = Math.max(loudest, Math.abs(value));

    if (captured >= nextPeakAt) {
      // 1.6 because a spoken voice rarely reaches full scale, and a waveform
      // drawn honestly from the raw peak is a flat line with two bumps in it.
      peaks.push(Math.min(1, loudest * 1.6));
      loudest = 0;
      nextPeakAt += samplesPerPeak;
    }

    onTick(Math.min((captured / rate) * 1000, MAX_MS), peaks);

    // The cap, enforced where the samples are counted, so the UI cannot forget
    // it and a backgrounded tab cannot run past it.
    if (captured >= maxSamples) finish();
  };

  source.connect(processor);
  /*
    A ScriptProcessorNode does not run unless it is connected onwards. Silenced
    on the way out, or the phone plays your own voice back at you while you are
    still speaking.
  */
  const mute = audio.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(audio.destination);

  let settle: ((recording: Recording | null) => void) | null = null;
  const finished = new Promise<Recording | null>((resolve) => {
    settle = resolve;
  });

  function teardown(): void {
    stopped = true;
    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    mute.disconnect();
    release();
    void audio.close().catch(() => undefined);
  }

  function finish(): void {
    if (!settle) return;
    const resolve = settle;
    settle = null;

    teardown();

    const durationMs = Math.round((captured / rate) * 1000);
    if (captured === 0 || durationMs < 400) {
      // A tap rather than a hold. Nothing worth sending, and nothing worth an
      // error message either.
      resolve(null);
      return;
    }

    const samples = downsample(join(blocks, captured), rate, SAMPLE_RATE);
    resolve({
      blob: new Blob([wav(samples, SAMPLE_RATE)], { type: AUDIO_TYPE }),
      durationMs: Math.min(MAX_MS, durationMs),
      peaks: even(peaks),
    });
  }

  return {
    get peaks() {
      return peaks;
    },
    get elapsed() {
      return Math.min((captured / rate) * 1000, MAX_MS);
    },
    stop: () => {
      finish();
      return finished;
    },
    cancel: () => {
      if (!settle) return;
      const resolve = settle;
      settle = null;
      teardown();
      resolve(null);
    },
  };
}

/** The captured blocks as one run of samples. */
export function join(blocks: Float32Array[], total: number): Float32Array {
  const all = new Float32Array(total);
  let at = 0;
  for (const block of blocks) {
    if (at >= total) break;
    all.set(block.subarray(0, Math.min(block.length, total - at)), at);
    at += block.length;
  }
  return all;
}

/**
 * 48kHz down to 16, by averaging rather than by picking.
 *
 * Taking every third sample aliases — high frequencies fold down and make a
 * voice tinny in a way that sounds like a bad line. Averaging the samples that
 * fall inside each output step is the cheapest thing that does not, and at 3:1
 * it is close enough to a real filter that nobody could tell.
 */
export function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input;

  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));

  for (let i = 0; i < out.length; i += 1) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));

    let sum = 0;
    for (let n = start; n < end; n += 1) sum += input[n] ?? 0;
    out[i] = end > start ? sum / (end - start) : 0;
  }

  return out;
}

/**
 * A WAV file, written by hand.
 *
 * Forty-four bytes of header and then the samples: little-endian, signed
 * sixteen-bit, one channel. The same decision the ZIP writer and the PNG chunk
 * writer in this repo made — the format is small enough to be exact, and a
 * dependency for it would be a dependency for the life of the app.
 */
export function wav(samples: Float32Array, rate: number): ArrayBuffer {
  const bytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);

  const ascii = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVE');

  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // the size of this chunk
  view.setUint16(20, 1, true); // 1 = uncompressed PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per frame
  view.setUint16(34, 16, true); // bits per sample

  ascii(36, 'data');
  view.setUint32(40, bytes, true);

  for (let i = 0; i < samples.length; i += 1) {
    // Clamped before scaling: a sample past 1 would wrap into a loud click.
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }

  return buffer;
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
