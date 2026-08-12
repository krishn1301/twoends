import { useState } from 'react';

import { getAccent } from '@twoends/core';

import { Button, Field, TextInput } from '../components/Field.tsx';
import { supabase } from '../lib/supabase.ts';
import { markEmailOffered } from '../state/emailOffer.ts';
import { useSession } from '../state/session.ts';

/**
 * Asked once, after pairing, and never again.
 *
 * Until now the account has lived only in this browser's storage. That is a
 * deliberate trade — no wall in front of the app — but it is also fragile:
 * clearing the browser, losing the phone, or leaving an iOS home-screen app
 * untouched for a couple of months all end the same way.
 *
 * So this is the one moment the app asks, and the timing is the point. Before
 * pairing there is nothing to lose and the request is noise. Straight after
 * pairing there is a person on the other end, which is exactly when "do not
 * lose this" means something. Skipping is one tap and the offer moves to
 * settings rather than reappearing.
 */
export function SaveAccount({ onDone }: { onDone: () => void }) {
  const profile = useSession((s) => s.profile);
  const partner = useSession((s) => s.partner);
  const refresh = useSession((s) => s.refresh);

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tint = getAccent(profile?.accent_key ?? 'teal').onDark;

  function done() {
    markEmailOffered();
    onDone();
  }

  async function attach(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Attaches an email to the *existing* anonymous account rather than making
    // a new one, so the pairing and everything written so far survive.
    const { error } = await supabase.auth.updateUser({ email: email.trim() });

    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email_change',
    });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await refresh();
    done();
  }

  return (
    <div className="bg-void text-chalk flex min-h-full flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display text-[1.9rem] leading-[1.15] font-semibold tracking-tight">
          {partner ? `You and ${partner.display_name} are paired.` : 'You are paired.'}
        </h1>
        <p className="text-ash mt-3 text-[0.95rem] leading-relaxed">
          Right now this account lives only in this browser. If you clear it, change phone, or leave
          the app untouched for a couple of months, it goes with it.
        </p>
        <p className="text-ash mt-3 text-[0.95rem] leading-relaxed">
          An email address is the only way back in. It is used for nothing else — no newsletters, no
          password, no marketing, ever.
        </p>

        {!sent ? (
          <form onSubmit={attach} className="mt-8 flex flex-col gap-4">
            <Field label="Your email" error={error}>
              <TextInput
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Button accent={tint} disabled={busy || email.trim().length < 3}>
              {busy ? 'Sending…' : 'Save my account'}
            </Button>
            <Button type="button" variant="quiet" accent={tint} onClick={done}>
              Not now
            </Button>
          </form>
        ) : (
          <form onSubmit={confirm} className="mt-8 flex flex-col gap-4">
            <Field label="The code" hint={`Sent to ${email}.`} error={error}>
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="counter text-center text-2xl tracking-[0.4em]"
              />
            </Field>
            <Button accent={tint} disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Confirm'}
            </Button>
            <Button type="button" variant="quiet" accent={tint} onClick={done}>
              Do this later
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
