import { useRef, useState } from 'react';

import { getAccent } from '@twoends/core';

import { uploadSnap } from '../db/photos.ts';
import { formatBytes, shrinkForUpload } from '../lib/image.ts';
import { useSession } from '../state/session.ts';

/**
 * Send a photo of right now.
 *
 * `capture="environment"` opens the camera directly on a phone rather than the
 * gallery, because the feature is "what I am looking at", not "something I took
 * in March". The gallery is still one tap away in the picker.
 *
 * The preview is the shrunk file, not the original — what you approve is exactly
 * what travels, which is the honest way round and also stops a 5 MB image
 * sitting in memory on an old phone.
 */
export function Snap({ onSent }: { onSent?: () => void }) {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const inputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<{ url: string; bytes: number; saved: number } | null>(
    null,
  );
  const [file, setFile] = useState<Blob | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tint = getAccent(profile?.accent_key ?? 'teal').onDark;

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;

    setBusy(true);
    setError(null);

    try {
      const shrunk = await shrinkForUpload(chosen);
      if (preview) URL.revokeObjectURL(preview.url);

      setFile(shrunk.blob);
      setPreview({
        url: URL.createObjectURL(shrunk.blob),
        bytes: shrunk.blob.size,
        saved: shrunk.originalBytes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setBusy(false);
      // Let the same file be chosen twice in a row.
      event.target.value = '';
    }
  }

  async function send() {
    if (!couple || !profile || !file) return;
    setBusy(true);
    setError(null);

    const { error } = await uploadSnap(
      couple.id,
      profile.id,
      new File([file], 'snap', { type: file.type }),
      caption,
    );
    setBusy(false);

    if (error) {
      setError(error);
      return;
    }

    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setFile(null);
    setCaption('');
    onSent?.();
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => void choose(e)}
        className="hidden"
      />

      {preview ? (
        <>
          <div className="overflow-hidden rounded-[28px]">
            <img src={preview.url} alt="The photo you are about to send" className="w-full" />
          </div>

          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={80}
            placeholder="Say something about it (optional)"
            className="bg-surface-2 text-chalk placeholder:text-ash/60 w-full rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-white/25"
          />

          {/*
            Shown on purpose. This app's promise is that it stays free, and the
            reason it can is that a 4 MB photo becomes 200 KB before it leaves
            the phone. Saying so once costs a line and explains the whole
            economics of the thing.
          */}
          <p className="text-ash text-xs">
            Sending {formatBytes(preview.bytes)} instead of {formatBytes(preview.saved)}. The
            original never leaves your phone.
          </p>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="bg-surface grid aspect-[4/3] w-full place-items-center rounded-[28px] text-sm"
          style={{ border: `1.5px dashed ${tint}`, color: tint }}
        >
          {busy ? 'Preparing…' : 'Take a photo'}
        </button>
      )}

      {error && (
        <p className="text-sm" style={{ color: '#e4566e' }}>
          {error}
        </p>
      )}

      {preview && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="bg-surface-2 text-chalk h-12 rounded-full px-5 text-sm font-medium"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="text-void h-12 flex-1 rounded-full font-semibold disabled:opacity-40"
            style={{ background: tint }}
          >
            {busy ? 'Sending…' : 'Send it'}
          </button>
        </div>
      )}
    </div>
  );
}
