import { useState } from 'react';

import { Button, Field, TextInput } from '../components/Field.tsx';
import { supabase } from '../lib/supabase.ts';

const ACCENT = '#30c2bd';

/**
 * Sign in with a six-digit code sent by email. No passwords, anywhere, ever.
 *
 * That is one less thing to leak, one less form to build, one less "forgot
 * password" flow, and — for an app whose whole promise is that two people can
 * trust it — one less credential to be careless with. It also gives account
 * recovery for free: whoever can read the email is the account.
 */
export function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });

    setBusy(false);
    if (error) setError(error.message);
    else setSentTo(email.trim());
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!sentTo) return;
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.verifyOtp({
      email: sentTo,
      token: code.trim(),
      type: 'email',
    });

    setBusy(false);
    // The session lands via onAuthStateChange, so there is nothing to do on
    // success — the app re-renders itself into the next state.
    if (error) setError(error.message);
  }

  return (
    <div className="bg-void text-chalk flex min-h-full flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display mb-2 text-4xl leading-none font-semibold tracking-tight">
          twoends
        </h1>
        <p className="text-ash mb-10 text-[0.95rem] leading-relaxed">
          A small shared space for two people. Everything is free, permanently — no tier, no trial,
          no ads.
        </p>

        {!sentTo ? (
          <form onSubmit={sendCode} className="flex flex-col gap-5">
            <Field
              label="Your email"
              hint="We send a six-digit code. There is no password to forget."
              error={error}
            >
              <TextInput
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Button accent={ACCENT} disabled={busy || email.trim().length < 3}>
              {busy ? 'Sending…' : 'Send me a code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-5">
            <Field
              label="The code"
              hint={`Sent to ${sentTo}. It expires in an hour.`}
              error={error}
            >
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="counter text-center text-2xl tracking-[0.4em]"
              />
            </Field>
            <Button accent={ACCENT} disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              accent={ACCENT}
              onClick={() => {
                setSentTo(null);
                setCode('');
                setError(null);
              }}
            >
              Use a different email
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
