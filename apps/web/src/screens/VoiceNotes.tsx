import { useCallback, useEffect, useState } from 'react';

import { VOICE_LINES, getAccent, nextQuote } from '@twoends/core';

import { VoiceComposer, VoicePlayer } from '../components/Voice.tsx';
import { notifyPartner } from '../db/push.ts';
import {
  deleteVoiceNote,
  keepVoiceNote,
  recentVoiceNotes,
  sendVoiceNote,
  voiceUrls,
  type VoiceNote,
} from '../db/voice.ts';
import { canRecord } from '../lib/recorder.ts';
import { useSession } from '../state/session.ts';

/**
 * Saying something out loud.
 *
 * Its own place rather than a strip under the photographs, which is where it
 * started and where it was wrong. A voice note is not a snap with the picture
 * missing — it is the other half of the same idea, and burying it under a
 * screen called Snaps meant nobody would find it and nobody would think to.
 *
 * The line above the button rotates. A microphone with nothing said about it is
 * a feature; one with a reason beside it is an invitation, and a fixed reason
 * stops being read after a week.
 */
export function VoiceNotes() {
  const couple = useSession((s) => s.couple);
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;

  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [links, setLinks] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  /*
    Picked once per visit to the screen rather than on every render — a line
    that changed while somebody was reading it would be worse than one that
    never changed at all.
  */
  const [line] = useState(() => nextQuote(VOICE_LINES, null));

  const refresh = useCallback(() => setRound((n) => n + 1), []);

  useEffect(() => {
    const coupleId = couple?.id;
    if (!coupleId) return;

    let alive = true;
    void (async () => {
      const found = await recentVoiceNotes(coupleId);
      if (!alive) return;
      setNotes(found);

      const signed = await voiceUrls(found.map((note) => note.storage_path));
      if (alive) setLinks(signed);
    })();

    return () => {
      alive = false;
    };
  }, [couple?.id, round]);

  /*
    Deleting one, behind a confirmation.

    It is the only thing on this screen that cannot be undone — a photograph can
    at least be sent again from the camera roll, and a thirty-second thing
    somebody said once cannot. So the button arms rather than fires, and it says
    so on the second press rather than opening a dialog.

    Either of them can delete, which is the rule photographs already have: the
    person who said it does not own the memory of it, and unpairing has to be
    able to remove everything the pair made.
  */
  const [arming, setArming] = useState<string | null>(null);

  async function remove(note: VoiceNote) {
    if (arming !== note.id) {
      setArming(note.id);
      return;
    }

    setArming(null);
    // Gone from the list first: the two round trips take a moment and a row
    // that sits there after you confirmed reads as the tap not registering.
    setNotes((rows) => rows.filter((row) => row.id !== note.id));
    await deleteVoiceNote(note);
  }

  async function toggleKeep(note: VoiceNote) {
    setNotes((rows) => rows.map((row) => (row.id === note.id ? { ...row, kept: !row.kept } : row)));
    await keepVoiceNote(note.id, !note.kept);
  }

  const theirName = partner?.display_name ?? 'them';

  return (
    <div className="flex flex-col gap-5">
      {canRecord() ? (
        <div className="flex flex-col gap-3">
          {line && <p className="text-ash text-[0.95rem] leading-relaxed">{line}</p>}

          <VoiceComposer
            colour={mine}
            busy={busy}
            onSend={async (blob, durationMs, peaks) => {
              if (!couple || !profile) return;

              setBusy(true);
              const sent = await sendVoiceNote(couple.id, profile.id, blob, durationMs, peaks);
              setBusy(false);

              if (sent.error) setError(sent.error);
              else {
                notifyPartner('snap');
                refresh();
              }
            }}
          />
        </div>
      ) : (
        /*
          Said plainly rather than shown as a dead button. Recording needs a
          secure context, so this is what an old WebView or a plain-http origin
          gets — and it is worth explaining, because the same person on the same
          phone will find it working from the Home Screen.
        */
        <p className="text-ash text-[0.95rem] leading-relaxed">
          This browser will not let the app use the microphone. Adding TwoEnds to your Home Screen
          and opening it from there usually fixes it.
        </p>
      )}

      {error && (
        <p className="text-sm" style={{ color: '#e4566e' }}>
          {error}
        </p>
      )}

      {notes.length === 0 ? (
        <p className="text-ash py-6 text-[0.95rem] leading-relaxed">
          Nothing yet. Thirty seconds is the whole of it — long enough to say something, short
          enough that you will not put it off.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-surface lift rounded-[28px] px-4 py-3">
              <VoicePlayer
                url={links.get(note.storage_path)}
                durationMs={note.duration_ms}
                peaks={Array.isArray(note.peaks) ? note.peaks : []}
                colour={note.author_id === profile?.id ? mine : theirs}
              />
              <div className="mt-2 flex items-center gap-2 px-1">
                <span className="text-ash flex-1 text-xs">
                  {note.author_id === profile?.id ? 'You' : theirName} · {ago(note.created_at)}
                  {!note.kept && ` · goes in ${daysLeft(note.expires_at)}d`}
                </span>
                <button
                  type="button"
                  onClick={() => void toggleKeep(note)}
                  aria-pressed={note.kept}
                  aria-label={note.kept ? 'Kept forever' : 'Keep this one'}
                  title={
                    note.kept ? 'Kept — this one stays' : 'Voice notes go after 60 days unless kept'
                  }
                  className="grid h-9 w-9 place-items-center"
                  style={{ color: note.kept ? '#e4566e' : 'var(--color-ash)' }}
                >
                  <Heart filled={note.kept} />
                </button>

                <button
                  type="button"
                  onClick={() => void remove(note)}
                  onBlur={() => setArming((id) => (id === note.id ? null : id))}
                  aria-label={arming === note.id ? 'Delete it, for good' : 'Delete this one'}
                  className="text-ash grid h-9 place-items-center px-2 text-xs"
                >
                  {arming === note.id ? 'Sure?' : <Cross />}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/*
        The most common reason somebody hears nothing, and the one the app
        cannot detect.

        An iPhone's ringer switch mutes HTML audio — the button depresses, the
        waveform fills, the counter runs, and there is no sound. From inside the
        app that is indistinguishable from a broken recording, which is exactly
        how it gets reported. Said once, under the list, only where it applies.
      */}
      {notes.length > 0 && isApple() && (
        <p className="text-ash text-[0.85rem] leading-relaxed">
          Hearing nothing? An iPhone&rsquo;s side switch mutes sound from the web, even at full
          volume. Turn the ringer on, or use headphones.
        </p>
      )}
    </div>
  );
}

/**
 * Whether this is an iPhone or an iPad.
 *
 * User-agent sniffing, which is normally the wrong tool — here it decides
 * whether to show one sentence of advice, and being wrong costs somebody
 * reading a line that does not apply to them. iPadOS reports itself as a Mac,
 * hence the touch check.
 */
function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
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

/** Filled means kept: this one has no expiry at all. */
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5 4.2 13a4.6 4.6 0 1 1 6.5-6.5l1.3 1.3 1.3-1.3A4.6 4.6 0 1 1 19.8 13z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Cross() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
