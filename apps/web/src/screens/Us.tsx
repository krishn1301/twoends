import { useCallback, useEffect, useRef, useState } from 'react';

import { ACCENTS, ACCENT_KEYS, getAccent, timeTogether, type AccentKey } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { removeAvatar, uploadAvatar } from '../db/avatars.ts';
import { supabase } from '../lib/supabase.ts';
import { useAvatars } from '../state/avatars.ts';
import { useSession } from '../state/session.ts';
import { useNow } from '../state/useNow.ts';

/**
 * Us.
 *
 * Everything about the two of you that is not a daily action: your face, your
 * name, your colour, and how long this has been going.
 *
 * Where both reference apps put a paywall block on this screen — "unlock all
 * games, unlimited journal entries and widgets" — there is a line here saying
 * the opposite, in the same slot. It is the one place someone goes looking for
 * the catch.
 */
export function Us() {
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const couple = useSession((s) => s.couple);
  const refresh = useSession((s) => s.refresh);
  const signOut = useSession((s) => s.signOut);
  const isAnonymous = useSession((s) => s.isAnonymous);

  const urls = useAvatars((s) => s.urls);
  const loadAvatars = useAvatars((s) => s.load);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? '');

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const now = useNow(1000);

  const syncAvatars = useCallback(() => {
    void loadAvatars([profile?.avatar_path, partner?.avatar_path]);
  }, [profile?.avatar_path, partner?.avatar_path, loadAvatars]);

  useEffect(syncAvatars, [syncAvatars]);

  async function pickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profile) return;

    setBusy(true);
    setError(null);
    const { error } = await uploadAvatar(profile.id, file);
    setBusy(false);

    if (error) {
      setError(error);
      return;
    }
    await refresh();
  }

  async function dropAvatar() {
    if (!profile?.avatar_path) return;
    setBusy(true);
    await removeAvatar(profile.id, profile.avatar_path);
    setBusy(false);
    await refresh();
  }

  async function saveName() {
    if (!profile || name.trim().length === 0) return;
    setEditingName(false);
    await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', profile.id);
    await refresh();
  }

  async function setAccent(key: AccentKey) {
    if (!profile) return;
    await supabase.from('profiles').update({ accent_key: key }).eq('id', profile.id);
    await refresh();
  }

  const elapsed = couple?.started_on ? timeTogether(couple.started_on, now) : null;

  return (
    <div className="bg-void text-chalk min-h-full px-5 pt-6 pb-32">
      <div className="mx-auto w-full max-w-md">
        <h1 className="font-display mb-6 text-2xl font-semibold tracking-tight">Us</h1>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={(e) => void pickAvatar(e)}
          className="hidden"
        />

        {/* The two of you, faces first. */}
        <div className="mb-8 flex items-center justify-center gap-5">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="relative"
            aria-label="Change your photo"
          >
            <Avatar
              name={profile?.display_name ?? '?'}
              accent={mine}
              size={92}
              src={profile?.avatar_path ? urls.get(profile.avatar_path) : null}
            />
            <span
              className="text-void absolute -right-1 -bottom-1 grid h-8 w-8 place-items-center rounded-full text-lg"
              style={{ background: mine }}
              aria-hidden="true"
            >
              +
            </span>
          </button>

          <span className="text-ash text-2xl">&</span>

          <Avatar
            name={partner?.display_name ?? '?'}
            accent={theirs}
            size={92}
            src={partner?.avatar_path ? urls.get(partner.avatar_path) : null}
          />
        </div>

        {elapsed && (
          <p className="text-ash mb-8 text-center text-sm">
            <span className="counter text-chalk">{elapsed.days}</span> days, and counting.
          </p>
        )}

        {error && (
          <p className="mb-4 text-center text-sm" style={{ color: '#e4566e' }}>
            {error}
          </p>
        )}

        <Group title="You">
          <Row label="Name">
            {editingName ? (
              <input
                autoFocus
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => e.key === 'Enter' && void saveName()}
                className="bg-surface-2 text-chalk w-32 rounded-lg px-2 py-1 text-right outline-none"
              />
            ) : (
              <button type="button" onClick={() => setEditingName(true)} className="text-ash h-11">
                {profile?.display_name} ›
              </button>
            )}
          </Row>

          {profile?.avatar_path && (
            <Row label="Photo">
              <button type="button" onClick={() => void dropAvatar()} className="text-ash h-11">
                Remove
              </button>
            </Row>
          )}

          <div className="px-4 py-3.5">
            <p className="mb-3 text-sm font-medium">Your colour</p>
            <div className="flex flex-wrap gap-2.5">
              {ACCENT_KEYS.map((key) => {
                const selected = key === profile?.accent_key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void setAccent(key)}
                    aria-label={ACCENTS[key].label}
                    aria-pressed={selected}
                    className="h-9 w-9 rounded-full transition-transform"
                    style={{
                      background: ACCENTS[key].onDark,
                      boxShadow: selected ? '0 0 0 2.5px #F2EDE9' : 'none',
                      transform: selected ? 'scale(1.1)' : 'none',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </Group>

        {/* The slot where the other apps sell you something. */}
        <div className="bg-surface mt-6 rounded-[28px] p-5">
          <p className="font-display text-[1.2rem] leading-snug font-semibold">
            Everything is already unlocked.
          </p>
          <p className="text-ash mt-1.5 text-sm leading-relaxed">
            Every widget, every question, every game. No tier, no trial, no ads. It stays that way.
          </p>
        </div>

        {isAnonymous && (
          <div className="bg-surface mt-4 rounded-[28px] p-5">
            <p className="text-[1.05rem] font-medium">This account lives in this browser</p>
            <p className="text-ash mt-1.5 text-sm leading-relaxed">
              Clear it or lose the phone and it goes with it. Adding an email is the only way back
              in — it is used for nothing else.
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => void signOut()}
          className="text-ash mt-8 h-12 w-full text-sm"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-ash mb-2 px-1 text-xs tracking-[0.18em] uppercase">{title}</h2>
      <div className="bg-surface divide-hairline divide-y overflow-hidden rounded-[28px]">
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
