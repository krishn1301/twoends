import { useEffect, useRef, useState } from 'react';

import {
  MAX_MS,
  PEAKS,
  canRecord,
  clock,
  startRecording,
  type LiveRecorder,
  type RecorderFailure,
} from '../lib/recorder.ts';

/**
 * Saying something, and hearing it.
 *
 * The waveform is the sender's colour in both — it is the one thing on a voice
 * note that says whose it is, since there is nothing to read and no face on it.
 *
 * Bars rather than a drawn path: forty-eight `<span>`s cost nothing, scale with
 * the text size, and need no canvas, no ref and no resize observer. A waveform
 * is a bar chart pretending to be a signal anyway.
 */

function Bars({
  peaks,
  colour,
  played = 1,
  dim = false,
}: {
  peaks: number[];
  colour: string;
  /** 0–1: how much of it has been heard. */
  played?: number;
  dim?: boolean;
}) {
  const bars = peaks.length > 0 ? peaks : new Array<number>(PEAKS).fill(0);

  return (
    <span className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden="true">
      {bars.map((peak, index) => {
        const heard = index / bars.length <= played;
        return (
          <span
            key={index}
            className="flex-1 rounded-full transition-[height,opacity] duration-100"
            style={{
              // A floor, so silence is still a line rather than a gap.
              height: `${Math.max(8, Math.round(peak * 100))}%`,
              background: colour,
              opacity: dim ? 0.35 : heard ? 1 : 0.3,
            }}
          />
        );
      })}
    </span>
  );
}

const REFUSALS: Record<RecorderFailure, string> = {
  denied:
    'The microphone is blocked for this app. Everything else still works — turn it on in your browser settings if you want to send one.',
  'no-microphone': 'No microphone on this device.',
  unsupported: 'This browser cannot record audio.',
  failed: 'The microphone would not start.',
};

/**
 * Hold to speak, let go to send.
 *
 * Holding rather than tapping twice, because the cap is thirty seconds and a
 * hold makes the length obvious in the hand — you can feel how long you have
 * been talking. Letting go under half a second is a mis-tap and sends nothing.
 */
export function VoiceComposer({
  colour,
  onSend,
  busy,
}: {
  colour: string;
  busy: boolean;
  onSend: (blob: Blob, durationMs: number, peaks: number[]) => Promise<void>;
}) {
  const [live, setLive] = useState<LiveRecorder | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [refused, setRefused] = useState<string | null>(null);
  const holding = useRef(false);

  // The microphone must not stay on because a component went away.
  useEffect(() => () => live?.cancel(), [live]);

  if (!canRecord()) return null;

  async function begin() {
    if (live || busy) return;

    holding.current = true;
    setRefused(null);

    const started = await startRecording((ms, shape) => {
      setElapsed(ms);
      setPeaks([...shape]);
    });

    if (typeof started === 'string') {
      setRefused(REFUSALS[started]);
      holding.current = false;
      return;
    }

    // Let go before permission came back: do not leave a recorder running
    // behind a dialog nobody is looking at any more.
    if (!holding.current) {
      started.cancel();
      return;
    }

    setLive(started);
  }

  async function end() {
    holding.current = false;
    if (!live) return;

    const recording = await live.stop();
    setLive(null);
    setElapsed(0);
    setPeaks([]);

    if (recording) await onSend(recording.blob, recording.durationMs, recording.peaks);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          void begin();
        }}
        onPointerUp={() => void end()}
        onPointerCancel={() => void end()}
        onLostPointerCapture={() => void end()}
        className={`flex min-h-14 w-full touch-none items-center gap-3 rounded-full px-5 transition-colors disabled:opacity-40 ${
          live ? '' : 'bg-surface-2'
        }`}
        style={
          live
            ? { background: `color-mix(in oklab, ${colour} 24%, var(--color-tint-base))` }
            : undefined
        }
      >
        {live ? (
          <>
            <Bars peaks={peaks} colour={colour} />
            <span className="counter text-chalk shrink-0 text-sm">{clock(MAX_MS - elapsed)}</span>
          </>
        ) : (
          <>
            <Microphone colour={colour} />
            <span className="text-ash flex-1 text-left text-[0.95rem]">
              {busy ? 'Sending…' : 'Hold to say something'}
            </span>
            <span className="text-ash shrink-0 text-[0.78rem]">30s</span>
          </>
        )}
      </button>

      {refused && <p className="text-ash text-[0.85rem] leading-relaxed">{refused}</p>}
    </div>
  );
}

/**
 * Playing one back.
 *
 * One `<audio>` per note rather than a shared player: they are thirty seconds
 * each, the browser handles seeking and buffering better than anything written
 * here would, and two playing at once is a thing people do on purpose.
 */
export function VoicePlayer({
  url,
  durationMs,
  peaks,
  colour,
}: {
  url: string | undefined;
  durationMs: number;
  peaks: number[];
  colour: string;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  /*
    A file this browser cannot decode used to do nothing at all: the button
    depressed, no sound, no error. Silence is the worst possible report,
    because the obvious reading is that the recording failed — and it had not.

    It keeps the reason rather than a flag. `MediaError.code` splits the whole
    space in one number — 2 is the link, 3 is the bytes, 4 is the container —
    and there is no other way to learn which of the three it was on a phone
    nobody can attach a debugger to.
  */
  const [broken, setBroken] = useState<string | null>(null);

  const seconds = durationMs / 1000;
  const played = seconds > 0 ? Math.min(1, at / seconds) : 0;

  if (broken) {
    return (
      <div className="flex items-center gap-3">
        <Bars peaks={peaks} colour={colour} played={0} dim />
        <span className="text-ash shrink-0 text-[0.78rem]">{broken}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={!url}
        onClick={() => {
          const element = audio.current;
          if (!element) return;
          if (element.paused) {
            // A rejected `play()` is the other way this fails silently — iOS
            // refuses one that is not inside a gesture, and a decode error
            // arrives here rather than on the element.
            void element.play().catch(() => setBroken(reasonFor(element)));
          } else element.pause();
        }}
        aria-label={playing ? 'Pause' : 'Play'}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full disabled:opacity-40"
        style={{ background: `color-mix(in oklab, ${colour} 26%, var(--color-tint-base))` }}
      >
        {playing ? <Pause colour={colour} /> : <Play colour={colour} />}
      </button>

      {/*
        The waveform is the scrubber. A separate slider under it would be a
        second control for the same thing, and this one is already the right
        width and already says where you are.
      */}
      <button
        type="button"
        disabled={!url}
        aria-label="Seek"
        className="flex flex-1 items-center"
        onClick={(event) => {
          const element = audio.current;
          if (!element) return;
          const box = event.currentTarget.getBoundingClientRect();
          element.currentTime = ((event.clientX - box.left) / box.width) * seconds;
        }}
      >
        <Bars peaks={peaks} colour={colour} played={played} />
      </button>

      <span className="counter text-ash shrink-0 text-[0.78rem]">
        {clock(playing ? (seconds - at) * 1000 : durationMs)}
      </span>

      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setAt(0);
          }}
          onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
          onError={(event) => setBroken(reasonFor(event.currentTarget))}
        />
      )}
    </div>
  );
}

/**
 * Why a note would not play, in the fewest words that still name the half.
 *
 * The number in brackets is `MediaError.code`, and it is there on purpose: a
 * screenshot from a phone is the only report this app will ever get, and
 * “it doesn’t work” costs a round trip that a single digit does not. 2 means the
 * link expired or the file never arrived, 3 means the bytes are damaged, 4
 * means this browser will not take the container at all.
 */
function reasonFor(element: HTMLAudioElement): string {
  const code = element.error?.code ?? 0;
  if (code === 2) return 'could not load (2)';
  if (code === 3) return 'damaged (3)';
  if (code === 4) return 'wrong format (4)';
  return 'will not play here';
}

function Microphone({ colour }: { colour: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke={colour} strokeWidth="1.8" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        stroke={colour}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Play({ colour }: { colour: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 2.5 13 8l-9 5.5z" fill={colour} />
    </svg>
  );
}

function Pause({ colour }: { colour: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3.5" y="2.5" width="3.5" height="11" rx="1.2" fill={colour} />
      <rect x="9" y="2.5" width="3.5" height="11" rx="1.2" fill={colour} />
    </svg>
  );
}
