import { useCallback, useEffect, useRef, useState } from 'react';

import { ACCENTS, ACCENT_KEYS, getAccent, timeTogether, type AccentKey } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { removeAvatar, uploadAvatar } from '../db/avatars.ts';
import { disablePush, enablePush, pushState, type PushState } from '../db/push.ts';
import { supabase } from '../lib/supabase.ts';
import { useAvatars } from '../state/avatars.ts';
import { useDistanceReading, useLocation } from '../state/location.ts';
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
  const [push, setPush] = useState<PushState>(() => pushState());
  const [pushBusy, setPushBusy] = useState(false);

  const location = useLocation();
  const distance = useDistanceReading(partner?.display_name);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const now = useNow(1000);

  const syncAvatars = useCallback(() => {
    void loadAvatars([profile?.avatar_path, partner?.avatar_path]);
  }, [profile?.avatar_path, partner?.avatar_path, loadAvatars]);

  useEffect(syncAvatars, [syncAvatars]);

  useEffect(() => {
    if (profile?.id) void location.load(profile.id);
    // `location.load` is stable on the store and including the whole store here
    // would re-read a position on every unrelated set().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

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

  async function togglePush() {
    if (!profile) return;
    setPushBusy(true);
    setError(null);

    if (push === 'on') {
      await disablePush(profile.id);
    } else {
      const { error } = await enablePush(profile.id);
      if (error) setError(error);
    }

    setPush(pushState());
    setPushBusy(false);
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
            <p className="text-sm font-medium">Your colour</p>
            <p className="text-ash mt-1 mb-3 text-sm">
              Taken from your photo. Change it if you disagree.
            </p>
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

        <Group title="Notifications">
          {push === 'needs-install' ? (
            <div className="px-4 py-3.5">
              <p className="text-sm font-medium">Add TwoEnds to your Home Screen first</p>
              {/*
                Not a nag, a fact. Safari grants notification permission only to
                an installed web app, never to a tab — so asking here would fail
                with no way to tell refusal from impossibility.
              */}
              <p className="text-ash mt-1.5 text-sm leading-relaxed">
                On iPhone, notifications only work once the app is installed. Share → Add to Home
                Screen, then open it from there.
              </p>
            </div>
          ) : push === 'unsupported' ? (
            <div className="px-4 py-3.5">
              <p className="text-ash text-sm">This browser cannot do notifications.</p>
            </div>
          ) : (
            <Row label={push === 'on' ? 'On' : 'Off'}>
              <button
                type="button"
                onClick={() => void togglePush()}
                disabled={pushBusy || push === 'denied'}
                className="text-ash h-11 text-sm disabled:opacity-40"
              >
                {push === 'denied' ? 'Blocked in settings' : push === 'on' ? 'Turn off' : 'Turn on'}
              </button>
            </Row>
          )}

          <div className="px-4 py-3.5">
            <p className="text-ash text-sm leading-relaxed">
              At most two a day, each. Never a reminder that you have not done something — only that
              they did.
            </p>
          </div>
        </Group>

        {/*
          Location.

          The most sensitive switch in the app, so it gets the most words. Three
          things are stated plainly rather than buried in a privacy policy: that
          it is off until you turn it on, that it reads your position only while
          the app is open, and that turning it off deletes the coordinate rather
          than freezing it. All three are enforced in the database — see
          supabase/migrations/00000000000013_location.sql.
        */}
        <Group title="Distance">
          {location.state === 'unsupported' ? (
            <div className="px-4 py-3.5">
              <p className="text-ash text-sm">This browser cannot do location.</p>
            </div>
          ) : (
            <>
              <Row label={location.presence.sharing ? 'Sharing' : 'Off'}>
                <button
                  type="button"
                  onClick={() =>
                    void (profile &&
                      (location.presence.sharing
                        ? location.disable(profile.id)
                        : location.enable(profile.id)))
                  }
                  disabled={location.busy || location.state === 'denied'}
                  className="text-ash h-11 text-sm disabled:opacity-40"
                >
                  {location.state === 'denied'
                    ? 'Blocked in settings'
                    : location.presence.sharing
                      ? 'Turn off'
                      : 'Turn on'}
                </button>
              </Row>

              {location.presence.sharing && (
                <Row label="Precise">
                  <button
                    type="button"
                    onClick={() =>
                      void (profile &&
                        location.togglePrecise(profile.id, !location.presence.wantsPrecise))
                    }
                    disabled={location.busy}
                    className="text-ash h-11 text-sm disabled:opacity-40"
                  >
                    {location.presence.wantsPrecise ? 'Asked for' : 'Ask for it'}
                  </button>
                </Row>
              )}

              <div className="px-4 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-medium">
                    {distance.kind === 'apart' ? `${distance.label} km` : distance.label}
                  </p>
                  {/*
                    A manual refresh, because location here is foreground-only
                    and there is no widget on this platform to make a frozen
                    number obvious. Without it the only way to update a reading
                    is to leave the app and come back.
                  */}
                  {location.presence.sharing && (
                    <button
                      type="button"
                      onClick={() => void (profile && location.enable(profile.id))}
                      disabled={location.busy}
                      className="text-ash text-sm disabled:opacity-40"
                    >
                      {location.busy ? 'Checking…' : 'Refresh'}
                    </button>
                  )}
                </div>
                <p className="text-ash mt-1 text-sm">{location.error ?? distance.note}</p>
                {distance.since && !location.error && (
                  <p className="text-ash mt-1 text-sm opacity-70">As of {distance.since}.</p>
                )}
              </div>

              <div className="px-4 py-3.5">
                <p className="text-ash text-sm leading-relaxed">
                  Off until you turn it on, and only for you — turning it on does not turn it on for{' '}
                  {partner?.display_name ?? 'them'}. Your position is read while the app is open and
                  at no other time, rounded to about ten kilometres, and{' '}
                  {partner?.display_name ?? 'they'} only ever sees a distance. Turning it off
                  deletes the coordinate.
                </p>
                {location.presence.sharing && (
                  <p className="text-ash mt-2.5 text-sm leading-relaxed">
                    Precise takes effect only when you have both asked for it, and stops the moment
                    either of you stops asking.
                  </p>
                )}
              </div>
            </>
          )}
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
