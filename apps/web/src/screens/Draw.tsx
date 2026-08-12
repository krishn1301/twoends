import { useState } from 'react';

import { emptyDrawing, getAccent, isEmpty, type Drawing } from '@twoends/core';

import { DrawSurface } from '../components/DrawSurface.tsx';
import { sendDrawing } from '../db/canvas.ts';
import { useSession } from '../state/session.ts';

/**
 * Draw them something.
 *
 * Deliberately spare: a square, your colour, undo, clear, send. No brush sizes,
 * no palette, no layers. The drawings in the reference apps that people
 * actually keep are scribbles made in ten seconds — a tool that invites care
 * would get used less, not more.
 */
export function Draw({ onSent }: { onSent?: () => void }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);

  const [drawing, setDrawing] = useState<Drawing>(emptyDrawing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tint = getAccent(profile?.accent_key ?? 'teal').onDark;
  const nothingYet = isEmpty(drawing);

  function undo() {
    setDrawing((d) => ({ version: 1, strokes: d.strokes.slice(0, -1) }));
  }

  async function send() {
    if (!couple || !profile) return;
    setBusy(true);
    setError(null);

    const { error } = await sendDrawing(couple.id, profile.id, drawing);
    setBusy(false);

    if (error) {
      setError(error);
      return;
    }
    setDrawing(emptyDrawing());
    onSent?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="overflow-hidden rounded-[28px]"
        style={{ background: 'var(--color-surface)' }}
      >
        <DrawSurface
          color={tint}
          drawing={drawing}
          onChange={setDrawing}
          className="aspect-square"
        />
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
          disabled={drawing.strokes.length === 0}
          className="bg-surface-2 text-chalk h-12 rounded-full px-5 text-sm font-medium disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => setDrawing(emptyDrawing())}
          disabled={nothingYet}
          className="bg-surface-2 text-chalk h-12 rounded-full px-5 text-sm font-medium disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || nothingYet}
          className="text-void h-12 flex-1 rounded-full font-semibold disabled:opacity-40"
          style={{ background: tint }}
        >
          {busy ? 'Sending…' : 'Send it'}
        </button>
      </div>
    </div>
  );
}
