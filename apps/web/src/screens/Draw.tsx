import { useCallback, useEffect, useState } from 'react';

import { ACCENTS, emptyDrawing, getAccent, type Drawing, type Stroke } from '@twoends/core';

import { DrawSurface } from '../components/DrawSurface.tsx';
import { appendStrokes, clearCanvas } from '../db/canvas.ts';
import { notifyPartner } from '../db/push.ts';
import { useSession } from '../state/session.ts';
import { useShared } from '../state/shared.ts';

/**
 * The shared canvas.
 *
 * You open it and what is already there is already there — including whatever
 * they drew. You add to it and send, and your strokes join the same surface
 * rather than becoming a separate picture.
 *
 * Only the strokes you added travel. The existing canvas stays put, which is
 * what makes two people drawing at once safe: there is nothing to overwrite.
 */

/**
 * Six colours, not a picker.
 *
 * The two of yours first, because the point of this app is that the two of you
 * have colours. The rest are chosen to read on a near-black canvas — a full
 * spectrum would include several that vanish against it.
 */
function paletteFor(mine: string, theirs: string): string[] {
  return [mine, theirs, '#F2EDE9', ACCENTS.amber.onDark, ACCENTS.citron.onDark, ACCENTS.sky.onDark];
}

export function Draw({ onSent }: { onSent?: () => void }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const palette = paletteFor(mine, theirs);

  const canvas = useShared((s) => s.canvas);
  const load = useShared((s) => s.load);

  /**
   * What is already on the shared canvas — read straight from the store rather
   * than copied into state, so a partner's strokes appear as they arrive.
   */
  const base: Drawing = canvas?.drawing ?? emptyDrawing();

  /** What this person has added since. Only this travels. */
  const [added, setAdded] = useState<Stroke[]>([]);

  const [color, setColor] = useState(mine);
  const [erasing, setErasing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (couple) void load(couple);
  }, [couple, load]);

  useEffect(refresh, [refresh]);

  // Rendered as one picture; kept apart so only the new part travels.
  const combined: Drawing = { version: 1, strokes: [...base.strokes, ...added] };

  function undo() {
    setAdded((strokes) => strokes.slice(0, -1));
  }

  async function send() {
    if (!couple || !profile) return;
    setBusy(true);
    setError(null);

    const { error } = await appendStrokes(couple.id, profile.id, {
      version: 1,
      strokes: added,
    });

    if (error) {
      setBusy(false);
      setError(error);
      return;
    }

    // Refresh first, then drop the pending strokes. The other order blanks the
    // canvas for a frame while the store catches up.
    if (couple) await load(couple);
    setAdded([]);
    setBusy(false);
    notifyPartner('drawing');
    onSent?.();
  }

  async function wipe() {
    if (!couple || !profile) return;
    setBusy(true);
    const { error } = await clearCanvas(couple.id, profile.id);
    setBusy(false);

    if (error) {
      setError(error);
      return;
    }
    setAdded([]);
    refresh();
  }

  const nothingNew = added.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-[28px]"
        style={{ background: 'var(--color-surface)' }}
      >
        <DrawSurface
          color={color}
          erasing={erasing}
          drawing={combined}
          onStroke={(stroke) => setAdded((strokes) => [...strokes, stroke])}
          className="aspect-square"
        />
      </div>

      <div className="flex items-center gap-2">
        {palette.map((swatch) => {
          const selected = !erasing && swatch === color;
          return (
            <button
              key={swatch}
              type="button"
              aria-label={`Draw in ${swatch}`}
              aria-pressed={selected}
              onClick={() => {
                setColor(swatch);
                setErasing(false);
              }}
              className="h-9 w-9 shrink-0 rounded-full transition-transform"
              style={{
                background: swatch,
                boxShadow: selected ? '0 0 0 2.5px #F2EDE9' : 'none',
                transform: selected ? 'scale(1.1)' : 'none',
              }}
            />
          );
        })}

        <button
          type="button"
          aria-label="Eraser"
          aria-pressed={erasing}
          onClick={() => setErasing((e) => !e)}
          className="ml-auto grid h-9 w-9 shrink-0 place-items-center rounded-full"
          style={{
            background: erasing ? '#F2EDE9' : 'var(--color-surface-2)',
            color: erasing ? '#141110' : '#948A82',
          }}
        >
          <Eraser />
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: '#e4566e' }}>
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={undo}
          disabled={added.length === 0}
          className="bg-surface-2 text-chalk h-12 rounded-full px-5 text-sm font-medium disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => void wipe()}
          disabled={busy || combined.strokes.length === 0}
          className="bg-surface-2 text-chalk h-12 rounded-full px-5 text-sm font-medium disabled:opacity-40"
          title="Clears it for both of you"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || nothingNew}
          className="text-void h-12 flex-1 rounded-full font-semibold disabled:opacity-40"
          style={{ background: mine }}
        >
          {busy ? 'Sending…' : 'Add to the canvas'}
        </button>
      </div>
    </div>
  );
}

function Eraser() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8.5 19.5 4 15a2 2 0 0 1 0-2.8l7.2-7.2a2 2 0 0 1 2.8 0l4.5 4.5a2 2 0 0 1 0 2.8l-7.2 7.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 20h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
