import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ACCENTS,
  ACCENT_KEYS,
  COLOPHON,
  SIGNATURE,
  adultState,
  getAccent,
  localDateIn,
  timeTogether,
  type AccentKey,
} from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { endQuiet, startQuiet } from '../db/quiet.ts';
import { Monogram } from '../components/Monogram.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { Colophon } from './Colophon.tsx';

import { removeAvatar, uploadAvatar } from '../db/avatars.ts';
import { exportEverything, type ExportProgress } from '../db/exportAll.ts';
import { cancelUnpair, confirmUnpair, requestUnpair, unpairState } from '../db/unpair.ts';
import { useChrome, useDesignVersion } from '../design/version.ts';
import { saveFile } from '../lib/saveFile.ts';
import { disablePush, enablePush, pushState, type PushState } from '../db/push.ts';
import { supabase } from '../lib/supabase.ts';
import { useAvatars } from '../state/avatars.ts';
import { useDistanceReading, useLocation } from '../state/location.ts';
import { useSession } from '../state/session.ts';
import { useShared } from '../state/shared.ts';
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
  const [colophon, setColophon] = useState(false);

  const quietNow = useShared((s) => s.quietNow);
  const reloadShared = useShared((s) => s.load);

  /*
    Either of them may ask for quiet and either may lift it. Deliberately unlike
    the 18+ opt-in, where consent belongs to a person: this is done to the pair
    rather than to the other one, and a hush that needed both to agree first
    would be no use on the week somebody actually needed it.
  */
  async function toggleQuiet() {
    if (!couple) return;
    setBusy(true);
    setError(null);

    const today = localDateIn(couple.day_timezone ?? 'UTC');

    /*
      The result was being thrown away, which is half of why the off switch was
      reported as broken rather than as failing: a refused write and a successful
      one looked exactly alike from here — the button simply went on saying what
      it had said before.
    */
    const { error: failed } = quietNow
      ? await endQuiet(couple.id, today)
      : await startQuiet(couple.id, today);

    if (failed) setError(failed);

    await reloadShared(couple);
    setBusy(false);
  }

  const adult = adultState(profile?.adult_opt_in_at, partner?.adult_opt_in_at);
  const optedIn = profile?.adult_opt_in_at != null;

  /*
    Writes only this person's own row. The "update own profile" policy is scoped
    to `id = auth.uid()`, so the database refuses to let either of them answer
    for the other — which is what makes the column consent rather than a setting.
    `couples.adult_packs_enabled` is then recomputed by a trigger; the app never
    writes it.
  */
  async function toggleAdult() {
    if (!profile) return;
    setBusy(true);
    await supabase
      .from('profiles')
      .update({ adult_opt_in_at: optedIn ? null : new Date().toISOString() })
      .eq('id', profile.id);
    await refresh();
    setBusy(false);
  }
  const [error, setError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [push, setPush] = useState<PushState>(() => pushState());
  const [pushBusy, setPushBusy] = useState(false);

  const [exporting, setExporting] = useState<ExportProgress | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [leftover, setLeftover] = useState<string[] | null>(null);

  const location = useLocation();
  const distance = useDistanceReading(partner?.display_name);

  const mine = getAccent(profile?.accent_key ?? 'teal').onDark;
  const theirs = getAccent(partner?.accent_key ?? 'rose').onDark;
  const chrome = useChrome(mine);
  const design = useDesignVersion((d) => d.version);
  const setDesign = useDesignVersion((d) => d.set);
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

  async function runExport() {
    if (!couple) return;
    setExported(null);
    setError(null);
    setExporting({ step: 'Starting', ratio: null });

    const { blob, filename, error } = await exportEverything(couple.id, setExporting);
    if (!blob) {
      setExporting(null);
      setError(error ?? 'Could not build the export.');
      return;
    }

    const saved = await saveFile(blob, filename);
    setExporting(null);
    if (saved.error) setError(saved.error);
    else setExported(saved.location ? `Saved to ${saved.location}.` : `Saved as ${filename}.`);
  }

  async function askUnpair() {
    setError(null);
    const { error } = await requestUnpair();
    if (error) setError(error);
    setArmed(false);
    await refresh();
  }

  async function callOff() {
    setError(null);
    const { error } = await cancelUnpair();
    if (error) setError(error);
    await refresh();
  }

  async function doUnpair() {
    if (!couple) return;
    setError(null);
    setLeftover(null);
    setDeleting('Starting');

    const { error, leftover } = await confirmUnpair(couple.id, setDeleting);
    setDeleting(null);

    if (error) {
      setError(error);
      return;
    }
    // Shown before the refresh, because the refresh unmounts this screen.
    if (leftover.length > 0) setLeftover(leftover);
    else await refresh();
  }

  const elapsed = couple?.started_on ? timeTogether(couple.started_on, now) : null;
  const unpair = unpairState(couple?.unpair_requested_by, profile?.id);

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
              style={{ background: chrome }}
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
                    void (
                      profile &&
                      (location.presence.sharing
                        ? location.disable(profile.id)
                        : location.enable(profile.id))
                    )
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
                      void (
                        profile &&
                        location.togglePrecise(profile.id, !location.presence.wantsPrecise)
                      )
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

        {/*
          Quiet mode.

          The one switch in here that turns things off rather than on, and the
          reason it finally exists: the occasions job started pushing at nine in
          the morning and checked `quiet_until` before sending, which sounded
          like an off switch and was not one, because nothing could set it.

          What it stops is said plainly rather than left to be discovered. A
          switch whose effects are a mystery gets turned on once and never
          again.
        */}
        {couple?.member_b && (
          <Group title="Quiet">
            <Row label={quietNow ? 'On' : 'Off'}>
              <button
                type="button"
                onClick={() => void toggleQuiet()}
                disabled={busy}
                className="text-ash h-11 text-sm disabled:opacity-40"
              >
                {quietNow ? 'Turn off' : 'Turn on'}
              </button>
            </Row>

            <div className="px-4 py-3.5">
              <p className="text-ash text-sm leading-relaxed">
                {quietNow
                  ? 'Nothing is being sent to either of you, and the streak is paused. It stays paused for these days afterwards — coming back does not cost you the week.'
                  : 'Stops every notification for both of you and pauses the streak. Days inside it are not missed days, then or later.'}
              </p>
              <p className="text-ash/70 mt-2 text-sm leading-relaxed">
                Either of you can turn it on, and either of you can turn it off.
              </p>
            </div>
          </Group>
        )}

        {/*
          The 18+ packs.

          Off by default, both of you have to say yes, and either of you can stop
          alone — deliberately *not* the unpair handshake, where one asks and the
          other confirms. That shape is right for destroying shared things and
          wrong for this: needing your partner's agreement to stop is not
          consent, it is negotiation.

          The four states exist because "off" and "waiting for them" look
          identical from the outside and mean completely different things, and a
          switch that appears to do nothing is one people turn off and never try
          again.
        */}
        {couple?.member_b && (
          <Group title="18+">
            <Row
              label={
                adult === 'on'
                  ? 'On'
                  : adult === 'waiting-for-them'
                    ? `Waiting for ${partner?.display_name ?? 'them'}`
                    : adult === 'waiting-for-you'
                      ? `${partner?.display_name ?? 'They'} asked for these`
                      : 'Off'
              }
            >
              <button
                type="button"
                onClick={() => void toggleAdult()}
                disabled={busy}
                className="text-ash h-11 text-sm disabled:opacity-40"
              >
                {optedIn ? 'Turn off' : 'I am 18 or over'}
              </button>
            </Row>

            <div className="px-4 py-3.5">
              <p className="text-ash text-sm leading-relaxed">
                {optedIn
                  ? 'You can turn this off on your own, at any time, without asking them.'
                  : 'A handful of more intimate questions and topics. Both of you have to turn it on, and either of you can turn it back off alone.'}
              </p>
              <p className="text-ash/70 mt-2 text-sm leading-relaxed">
                {/*
                  Worth saying out loud, because it is the part people would
                  otherwise have to trust. It is also already true by
                  construction rather than by a guard: the push function holds
                  five fixed messages and cannot be handed a body, and the widget
                  snapshot carries no question text at all.
                */}
                These never appear on a widget or in a notification.
              </p>
            </div>
          </Group>
        )}

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

        {/*
          The two promises that are only real if they have a button.

          "The data belongs to the couple" and "unpair means delete" are both in
          docs/PRIVACY.md, and until now neither had a way to be invoked. A
          promise nobody can exercise is a paragraph.
        */}
        <Group title="Your data">
          <Row label="Export everything">
            <button
              type="button"
              onClick={() => void runExport()}
              disabled={exporting !== null || !couple}
              className="text-ash h-11 text-sm disabled:opacity-40"
            >
              {exporting ? 'Working…' : 'Download'}
            </button>
          </Row>

          <div className="px-4 py-3.5">
            {exporting ? (
              <>
                <p className="text-sm font-medium">{exporting.step}</p>
                <div className="bg-surface-2 mt-2.5 h-1 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{
                      background: mine,
                      width:
                        exporting.ratio === null ? '15%' : `${Math.round(exporting.ratio * 100)}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="text-ash text-sm leading-relaxed">
                {exported ??
                  'A ZIP of plain JSON and your photos at the size they were uploaded. Nothing in it needs this app to read it. Your location is deliberately left out.'}
              </p>
            )}
          </div>
        </Group>

        {couple?.member_b && (
          <Group title="Unpair">
            {unpair.kind === 'waiting' ? (
              <>
                <Row label="Waiting for them">
                  <button
                    type="button"
                    onClick={() => void callOff()}
                    className="text-ash h-11 text-sm"
                  >
                    Call it off
                  </button>
                </Row>
                <div className="px-4 py-3.5">
                  <p className="text-ash text-sm leading-relaxed">
                    You have asked to unpair. Nothing is deleted until{' '}
                    {partner?.display_name ?? 'they'} confirms on their own phone, and either of you
                    can call it off until then.
                  </p>
                </div>
              </>
            ) : unpair.kind === 'asked' ? (
              <>
                <Row label={`${partner?.display_name ?? 'They'} asked to unpair`}>
                  <button
                    type="button"
                    onClick={() => void callOff()}
                    className="text-ash h-11 text-sm"
                  >
                    Call it off
                  </button>
                </Row>
                <div className="px-4 py-3.5">
                  <p className="text-sm leading-relaxed">
                    Confirming deletes everything the two of you made — every photo, answer, drawing
                    and note — on both phones and on the server. It cannot be undone.
                  </p>
                  <p className="text-ash mt-2 text-sm leading-relaxed">
                    Export first if you want to keep any of it.
                  </p>
                  <button
                    type="button"
                    onClick={() => void doUnpair()}
                    disabled={deleting !== null}
                    className="mt-3.5 h-12 w-full rounded-full text-sm font-medium disabled:opacity-40"
                    style={{ background: '#e4566e', color: '#141110' }}
                  >
                    {deleting ?? 'Delete everything'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <Row label="Unpair and delete">
                  <button
                    type="button"
                    onClick={() => (armed ? void askUnpair() : setArmed(true))}
                    className="text-ash h-11 text-sm"
                  >
                    {armed ? 'Yes, ask them' : 'Start'}
                  </button>
                </Row>
                <div className="px-4 py-3.5">
                  <p className="text-ash text-sm leading-relaxed">
                    {armed
                      ? `This asks ${partner?.display_name ?? 'them'} to confirm. Nothing is deleted until they do.`
                      : 'It takes both of you: one asks, the other confirms. Then everything the two of you made is deleted for good — not hidden, not archived.'}
                  </p>
                </div>
              </>
            )}

            {leftover && (
              /*
                The delete ran and something is still there. Saying so is the
                only honest option: a "done" that is not true is precisely the
                failure this app's privacy claims cannot survive.
              */
              <div className="px-4 py-3.5">
                <p className="text-sm font-medium" style={{ color: '#e4566e' }}>
                  Some data survived the delete
                </p>
                <p className="text-ash mt-1.5 text-sm leading-relaxed">
                  {leftover.join(', ')} still returns rows. Please report this — it is a bug in the
                  delete, and it is the most serious kind this app can have.
                </p>
              </div>
            )}
          </Group>
        )}

        {/*
          Which look the app is wearing.

          The visual review proposes fifteen changes and the ask that came with
          it was that the original had to still be there — so every one of them
          is behind this switch, and it lives here rather than behind a gesture
          because a thing you are meant to compare has to be findable by the
          person comparing it. `?design=classic` on the URL does the same and
          sticks, which is the only way to hand somebody a link to one of them.

          It is not meant to be permanent. When one of the two wins the other
          gets deleted and this row goes with it.
        */}
        <Group title="Look">
          <Row label={design === 'v2' ? 'Updated' : 'Original'}>
            <button
              type="button"
              onClick={() => setDesign(design === 'v2' ? 'classic' : 'v2')}
              className="text-ash h-11 text-sm"
            >
              {design === 'v2' ? 'Use the original' : 'Use the updated one'}
            </button>
          </Row>

          <div className="px-4 py-3.5">
            <p className="text-ash text-sm leading-relaxed">
              {design === 'v2'
                ? 'Cards lift off the black, the labels on a coloured card are readable whichever two colours you have, and an empty screen shows what it looks like once there is something in it. The original is one tap away and nothing about your data changes either way.'
                : 'The app as it first shipped. The updated look raises the cards off the black, fixes the labels that were unreadable on a coloured card, and shows you what an empty screen would look like filled.'}
            </p>
          </div>
        </Group>

        {/*
          The promises the app makes, where somebody can actually read them.
          A row rather than only the monogram below, because the monogram is
          meant to be found and this is meant to be available — the six things
          on that page are the answer to "what is the catch", and an answer
          nobody can reach is not one.
        */}
        <Group title="About">
          <Row label={COLOPHON.title}>
            <button
              type="button"
              onClick={() => setColophon(true)}
              className="text-ash h-11 text-sm"
            >
              Read
            </button>
          </Row>
        </Group>

        <button
          type="button"
          onClick={() => void signOut()}
          className="text-ash mt-8 h-12 w-full text-sm"
        >
          Sign out
        </button>

        {/*
          The last thing on the last screen, in the space that was empty under
          Sign out. A dedication belongs where a book puts one — not in the way
          of anything, and not hidden either. Tapping it opens the page that
          explains the mark.
        */}
        <button
          type="button"
          onClick={() => setColophon(true)}
          aria-label={COLOPHON.title}
          className="mx-auto mt-6 mb-2 flex flex-col items-center gap-2 py-2 opacity-70"
        >
          <Monogram
            mine={profile?.display_name}
            theirs={partner?.display_name}
            myAccent={profile?.accent_key}
            theirAccent={partner?.accent_key}
            size={44}
          />
          <span className="counter text-ash text-[0.7rem] tracking-[0.3em] uppercase">
            {SIGNATURE.mark}
          </span>
        </button>
      </div>

      {colophon && (
        <Sheet title={COLOPHON.title} onClose={() => setColophon(false)}>
          <Colophon />
        </Sheet>
      )}
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
