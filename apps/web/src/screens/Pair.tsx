import { useState } from 'react';

import { getAccent } from '@twoends/core';
import { Avatar } from '@twoends/ui';

import { Button, Field, TextInput } from '../components/Field.tsx';
import { supabase } from '../lib/supabase.ts';
import { takeCoupleDraft } from '../state/coupleDraft.ts';
import { inviteCodeFromUrl, useSession } from '../state/session.ts';
import { useWaitForPartner } from '../state/useWaitForPartner.ts';

/**
 * The solo state.
 *
 * This is where most couple apps put a dead screen — a greyed-out home behind a
 * "waiting for your partner" modal. It is also, for a day or a week, the entire
 * product. So it is a real screen: it explains what the app is for, gives you
 * one code to send, and says plainly that nothing here will ever cost money.
 *
 * Postgres does the security work. `create_invite` and `redeem_invite` are
 * security-definer functions because the policy on `invites` deliberately hides
 * codes from everyone but their creator — a six-character code you can list is
 * not a secret.
 */

/** Postgres raises bare identifiers; turn them into sentences. */
const MESSAGES: Record<string, string> = {
  invalid_code: 'No invite with that code. Check the letters and try again.',
  code_expired: 'That code has expired. Ask them to send a new one.',
  code_already_used: 'That code has already been used.',
  couple_full: 'That person is already paired with someone.',
  already_paired: 'You are already paired.',
  cannot_pair_with_yourself: 'That is your own code.',
  finish_your_profile_first: 'Finish setting up your profile first.',
};

function humanise(message: string): string {
  const key = Object.keys(MESSAGES).find((k) => message.includes(k));
  return key ? MESSAGES[key]! : message;
}

export function Pair() {
  const profile = useSession((s) => s.profile);
  const refresh = useSession((s) => s.refresh);
  const signOut = useSession((s) => s.signOut);

  const [mode, setMode] = useState<'choose' | 'invite' | 'join'>(() =>
    inviteCodeFromUrl() ? 'join' : 'choose',
  );
  const [code, setCode] = useState('');
  const [entered, setEntered] = useState(() => inviteCodeFromUrl() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const accent = getAccent(profile?.accent_key ?? 'teal');
  const tint = accent.onDark;

  // The inviter has nothing to do but wait, and nothing on this screen would
  // otherwise tell them the waiting is over.
  useWaitForPartner(mode === 'invite' && code.length > 0);

  /**
   * Minting a code is something the person did, not something the screen needs
   * to stay in sync with — so it happens on the tap rather than in an effect.
   * Doing it in an effect also risks a second code on every re-render, and each
   * one is a real row someone could screenshot.
   */
  async function startInvite() {
    setMode('invite');
    if (code) return;

    setBusy(true);
    setError(null);

    const { data, error } = await supabase.rpc('create_invite');
    if (error) {
      setError(humanise(error.message));
    } else {
      setCode(data ?? '');
      // The couple row exists now, so onboarding's parked answers have
      // somewhere to land.
      const draft = takeCoupleDraft();
      if (draft) await supabase.from('couples').update(draft).not('id', 'is', null);
    }
    setBusy(false);
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.rpc('redeem_invite', { p_code: entered });
    setBusy(false);

    if (error) setError(humanise(error.message));
    else await refresh();
  }

  const link = code ? `${window.location.origin}/?invite=${code}` : '';

  async function share() {
    const text = `Join me on TwoEnds — my code is ${code}. ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // Cancelled the sheet. Fall through to copying.
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="bg-void text-chalk flex min-h-full flex-col px-6 pt-8 pb-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <header className="mb-10 flex items-center justify-between">
          <span className="font-display text-xl font-semibold tracking-tight">twoends</span>
          <button type="button" onClick={() => void signOut()} className="text-ash h-11 text-sm">
            Sign out
          </button>
        </header>

        {mode === 'choose' && (
          <>
            <div className="mb-8 flex items-center gap-3">
              <Avatar name={profile?.display_name ?? '?'} accent={tint} size={56} />
              <span className="flex-1 border-t border-dashed border-white/20" />
              <span className="grid h-14 w-14 place-items-center rounded-full border border-dashed border-white/25 text-2xl text-white/30">
                ?
              </span>
            </div>

            <h1 className="font-display text-[2rem] leading-[1.15] font-semibold tracking-tight">
              It takes two.
            </h1>
            <p className="text-ash mt-3 text-[0.95rem] leading-relaxed">
              One shared space, just for the pair of you. A question a day, photos straight to each
              other&rsquo;s home screen, and a counter that has been running since you started.
            </p>
            <p className="text-ash mt-3 text-[0.95rem] leading-relaxed">
              Everything is unlocked, permanently. There is no paid tier to find later.
            </p>

            <div className="mt-auto flex flex-col gap-2.5 pt-10">
              <Button accent={tint} onClick={() => void startInvite()}>
                Invite them
              </Button>
              <Button variant="quiet" accent={tint} onClick={() => setMode('join')}>
                I have a code
              </Button>
            </div>
          </>
        )}

        {mode === 'invite' && (
          <>
            <h1 className="font-display text-[1.9rem] leading-[1.15] font-semibold tracking-tight">
              Send them this.
            </h1>
            <p className="text-ash mt-3 text-[0.95rem] leading-relaxed">
              It works once, and only for the two of you. It expires in a week.
            </p>

            <div
              className="mt-8 rounded-[28px] px-6 py-8 text-center"
              style={{ background: `color-mix(in oklab, ${tint} 16%, #15120F)` }}
            >
              <p className="counter text-[2.4rem] leading-none font-medium tracking-[0.18em]">
                {busy && !code ? '······' : code}
              </p>
            </div>

            {error && (
              <p className="mt-3 text-center text-sm" style={{ color: '#e4566e' }}>
                {error}
              </p>
            )}

            {/*
              Says what the screen is doing. Without this it looks identical
              whether it is waiting, finished, or broken — which is precisely
              how the first pair of testers got stuck here.
            */}
            {code && (
              <p className="text-ash mt-6 flex items-center justify-center gap-2.5 text-sm">
                <span
                  className="inline-block h-2 w-2 animate-pulse rounded-full"
                  style={{ background: tint }}
                  aria-hidden="true"
                />
                Waiting for them to enter it. This screen moves on by itself.
              </p>
            )}

            <div className="mt-auto flex flex-col gap-2.5 pt-10">
              <Button accent={tint} onClick={() => void share()} disabled={!code}>
                {copied ? 'Copied' : 'Share the code'}
              </Button>
              <Button variant="quiet" accent={tint} onClick={() => setMode('choose')}>
                Back
              </Button>
            </div>
          </>
        )}

        {mode === 'join' && (
          <form onSubmit={join} className="flex flex-1 flex-col">
            <h1 className="font-display text-[1.9rem] leading-[1.15] font-semibold tracking-tight">
              What is their code?
            </h1>
            <p className="text-ash mt-3 text-[0.95rem] leading-relaxed">
              Six characters. Case does not matter.
            </p>

            <div className="mt-8">
              <Field label="Their code" error={error}>
                <TextInput
                  autoFocus
                  required
                  maxLength={6}
                  value={entered}
                  onChange={(e) => setEntered(e.target.value.toUpperCase().replace(/\s/g, ''))}
                  placeholder="ABC234"
                  className="counter text-center text-2xl tracking-[0.35em] uppercase"
                />
              </Field>
            </div>

            <div className="mt-auto flex flex-col gap-2.5 pt-10">
              <Button accent={tint} disabled={busy || entered.length < 6}>
                {busy ? 'Checking…' : 'Pair us'}
              </Button>
              <Button
                type="button"
                variant="quiet"
                accent={tint}
                onClick={() => {
                  setMode('choose');
                  setError(null);
                }}
              >
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
