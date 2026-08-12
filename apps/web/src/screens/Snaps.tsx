import { useCallback, useEffect, useRef, useState } from 'react';

import { getAccent } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { deleteSnap, keepSnap, uploadSnap, type Snap } from '../db/photos.ts';
import { formatBytes, shrinkForUpload } from '../lib/image.ts';
import { useSession } from '../state/session.ts';
import { useShared } from '../state/shared.ts';

/**
 * The pile of snaps.
 *
 * Opening this shows what has been sent, newest first, rather than jumping
 * straight to the camera — the first question anyone has is "what did they
 * send me", not "let me send something". Sending lives in the corner, one tap
 * away, which is the right weight for the second question.
 *
 * Nothing opens fullscreen. A photo of two people is best looked at in the
 * place it arrived, and a fullscreen viewer would need its own navigation,
 * its own back gesture, and its own way to be wrong.
 */
export function Snaps() {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const inputRef = useRef<HTMLInputElement>(null);

  // One store, so the pile here and the card on Home never disagree.
  const snaps = useShared((s) => s.snaps);
  const urls = useShared((s) => s.urls);
  const load = useShared((s) => s.load);
  const markKept = useShared((s) => s.markKept);
  const dropLocally = useShared((s) => s.dropSnap);

  const [pending, setPending] = useState<{
    blob: Blob;
    url: string;
    bytes: number;
    was: number;
  } | null>(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;

  const refresh = useCallback(() => {
    if (couple) void load(couple);
  }, [couple, load]);

  useEffect(refresh, [refresh]);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = '';
    if (!chosen) return;

    setBusy(true);
    setError(null);
    try {
      const shrunk = await shrinkForUpload(chosen);
      if (pending) URL.revokeObjectURL(pending.url);
      setPending({
        blob: shrunk.blob,
        url: URL.createObjectURL(shrunk.blob),
        bytes: shrunk.blob.size,
        was: shrunk.originalBytes,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!couple || !profile || !pending) return;
    setBusy(true);
    setError(null);

    const { error } = await uploadSnap(couple.id, profile.id, pending.blob, caption);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }

    URL.revokeObjectURL(pending.url);
    setPending(null);
    setCaption('');
    refresh();
  }

  async function remove(snap: Snap) {
    // Deliberately no confirmation dialogue for your own snap: it is one photo,
    // it is recoverable by sending another, and a modal for every tap is worse
    // than the rare misfire. Deleting the *partner's* is not offered at all.
    dropLocally(snap.id);
    await deleteSnap(snap);
  }

  async function toggleKeep(snap: Snap) {
    // Optimistic: this is a one-bit change, and waiting on a round trip to see
    // a pin light up feels broken.
    markKept(snap.id, !snap.kept);
    await keepSnap(snap.id, !snap.kept);
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

      {/* Composing takes over the sheet: what you are about to send is the only
          thing worth looking at until it is sent or discarded. */}
      {pending ? (
        <>
          <div className="overflow-hidden rounded-[28px]">
            <img src={pending.url} alt="About to send" className="w-full" />
          </div>

          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={80}
            placeholder="Say something about it (optional)"
            className="bg-surface-2 text-chalk placeholder:text-ash/60 w-full rounded-2xl px-4 py-3.5 outline-none focus:ring-2 focus:ring-white/25"
          />

          <p className="text-ash text-xs">
            Sending {formatBytes(pending.bytes)} instead of {formatBytes(pending.was)}. The original
            never leaves your phone.
          </p>

          {error && (
            <p className="text-sm" style={{ color: '#e4566e' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(pending.url);
                setPending(null);
              }}
              className="bg-surface-2 text-chalk h-12 rounded-full px-5 text-sm font-medium"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy}
              className="text-void h-12 flex-1 rounded-full font-semibold disabled:opacity-40"
              style={{ background: mine }}
            >
              {busy ? 'Sending…' : 'Send it'}
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-void h-12 w-full rounded-full font-semibold disabled:opacity-40"
            style={{ background: mine }}
          >
            {busy ? 'Preparing…' : 'Send a photo'}
          </button>

          {error && (
            <p className="text-sm" style={{ color: '#e4566e' }}>
              {error}
            </p>
          )}

          {snaps.length === 0 ? (
            <p className="text-ash py-8 text-center text-[0.95rem] leading-relaxed">
              Nothing here yet. A photo of what you are looking at right now is the whole idea.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {snaps.map((snap) => {
                const url = urls.get(snap.storage_path);
                const isTheirs = snap.author_id !== profile?.id;

                return (
                  <figure key={snap.id} className="bg-surface overflow-hidden rounded-[28px]">
                    {url ? (
                      <img
                        src={url}
                        alt={snap.caption ?? 'A snap'}
                        loading="lazy"
                        className="w-full"
                      />
                    ) : (
                      <div className="bg-surface-2 aspect-[4/3] w-full" />
                    )}

                    <figcaption className="flex items-center gap-3 px-4 py-3.5">
                      <Avatar
                        name={
                          isTheirs ? (partner?.display_name ?? '?') : (profile?.display_name ?? '?')
                        }
                        accent={isTheirs ? theirs : mine}
                        size={26}
                      />
                      <span className="min-w-0 flex-1">
                        {snap.caption && (
                          <span className="block truncate text-[0.95rem]">{snap.caption}</span>
                        )}
                        <span className="text-ash text-xs">
                          {isTheirs ? (partner?.display_name ?? 'Them') : 'You'} ·{' '}
                          {ago(snap.created_at)}
                          {!snap.kept && ` · goes in ${daysLeft(snap.expires_at)}d`}
                        </span>
                      </span>

                      {/*
                        Either partner may keep anything. The one who took the
                        photo does not own the memory of it.
                      */}
                      <button
                        type="button"
                        onClick={() => void toggleKeep(snap)}
                        aria-pressed={snap.kept}
                        aria-label={snap.kept ? 'Kept forever' : 'Keep this one'}
                        title={
                          snap.kept
                            ? 'Kept — this one stays'
                            : 'Photos go after 30 days unless kept'
                        }
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                        style={{ color: snap.kept ? '#e4566e' : '#948A82' }}
                      >
                        <Heart filled={snap.kept} />
                      </button>

                      {/* Only your own. Deleting the other person's photo from
                          their own shared space is not a thing this app does. */}
                      {!isTheirs && (
                        <button
                          type="button"
                          onClick={() => void remove(snap)}
                          aria-label="Delete this snap"
                          className="text-ash grid h-11 w-11 shrink-0 place-items-center rounded-full"
                        >
                          <Bin />
                        </button>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));
}

/** Filled means kept: this one survives the 30-day sweep. */
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.3s-7.5-4.6-7.5-9.6a4.2 4.2 0 0 1 7.5-2.6 4.2 4.2 0 0 1 7.5 2.6c0 5-7.5 9.6-7.5 9.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

function Bin() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 7h14M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7m-7 0 .8 11.1A1.9 1.9 0 0 0 9.7 20h4.6a1.9 1.9 0 0 0 1.9-1.9L17 7"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
