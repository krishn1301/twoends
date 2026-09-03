import { useState } from 'react';

import { Button, Field, TextInput } from '../components/Field.tsx';
import { useChrome } from '../design/version.ts';
import { signInReturnUrl, supabase } from '../lib/supabase.ts';
import { useSession } from '../state/session.ts';

const ACCENT = '#30c2bd';

/**
 * Auth errors, rewritten as sentences.
 *
 * The rule from the build plan is that an error says what failed *and what to
 * do*. "email rate limit exceeded" does neither — it reads like the person did
 * something wrong, when in fact the mail provider is throttling and the only
 * useful action is to wait.
 */
const AUTH_ERRORS: Array<[RegExp, string]> = [
  [
    /rate limit/i,
    'Too many codes requested. Wait a few minutes and try again — nothing is wrong with your account.',
  ],
  /*
    Supabase's phrasing for "shouldCreateUser is false and this address has no
    account" is "Signups not allowed for otp", which reads like the app is
    closed. What actually happened is almost always a typo, and the useful thing
    to say is which address was tried — the whole failure is that it differs from
    the right one by a character or two, and reading it back is what makes that
    visible. Matched before /invalid/ because the message contains "not allowed",
    not because of anything to do with validity.
  */
  [
    /signups not allowed|signup.*disabled|user not found/i,
    'No account uses that address. Check it letter by letter — a sign-in cannot create an account, so a small typo looks exactly like this.',
  ],
  [/invalid|expired/i, 'That code did not work. It may have expired — ask for a new one.'],
  [/valid email|invalid format/i, 'That does not look like an email address.'],
  [/network|fetch/i, 'Could not reach the server. Check your connection and try again.'],
];

function humaniseAuth(message: string): string {
  return AUTH_ERRORS.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}

/**
 * Running as an installed web app on an iPhone.
 *
 * `standalone` is a non-standard Safari property and the only reliable signal
 * there is; iOS does not support `display-mode: standalone` in a media query the
 * way every other platform does. Used for one sentence of guidance, never to
 * gate a feature — if the detection is wrong the screen still works.
 */
function isInstalledOnIOS(): boolean {
  const standalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return standalone === true;
}

/**
 * Sign in with a six-digit code sent by email. No passwords, anywhere, ever.
 *
 * That is one less thing to leak, one less form to build, one less "forgot
 * password" flow, and — for an app whose whole promise is that two people can
 * trust it — one less credential to be careless with. It also gives account
 * recovery for free: whoever can read the email is the account.
 */
export function SignIn() {
  /*
    Nobody has a colour yet on this screen, which is why `ACCENT` is a constant
    at all. In the proposed look the interface is not a colour, so it takes the
    same bone as every other screen rather than a teal that belongs to nobody.
  */
  const tint = useChrome(ACCENT);
  const cancelSignIn = useSession((s) => s.cancelSignIn);
  const sessionError = useSession((s) => s.error);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  /** True when they arrived with a code rather than asking us to send one. */
  const [given, setGiven] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        /*
          This screen says, at the top, "signing back in to an account you
          already have" — and then created a new one for anybody who mistyped.
          Four accounts in this project are that mistake: an address off by one
          character, a fresh empty app, and no way to tell from the inside that
          anything went wrong. The owner's own is among them; he has one account
          holding four months of a relationship and another, made minutes later,
          holding nothing, and the two differ by a leading digit.

          Silence is what makes it so bad. A new account looks exactly like a
          successful sign-in until you notice your partner is gone. Refusing
          costs a person one clear sentence; accepting costs them everything they
          wrote, with no error to search for.

          Nobody needs this to start: the app signs you in anonymously on first
          open and `SaveAccount` attaches the address afterwards. This route is
          only ever for coming back.
        */
        shouldCreateUser: false,
        // `emailRedirectTo` rather than the dashboard's Site URL — see the note
        // on `signInReturnUrl`. Undefined in the Android app, where the fallback
        // is the right answer and this origin would be `http://localhost`.
        emailRedirectTo: signInReturnUrl(),
      },
    });

    setBusy(false);
    if (error) setError(humaniseAuth(error.message));
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
    if (error) setError(humaniseAuth(error.message));
  }

  return (
    <div className="bg-void text-chalk flex min-h-full flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="font-display mb-2 text-4xl leading-none font-semibold tracking-tight">
          twoends
        </h1>
        <p className="text-ash mb-10 text-[0.95rem] leading-relaxed">
          Signing back in to an account you already have. If you are new, go back — you do not need
          one to start.
        </p>

        {sessionError && (
          <p className="mb-6 text-sm" style={{ color: '#e4566e' }}>
            {sessionError}
          </p>
        )}

        {!sentTo ? (
          <form onSubmit={sendCode} className="flex flex-col gap-5">
            <Field
              label="Your email"
              hint="We send a sign-in link. There is no password to forget."
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
            <Button accent={tint} disabled={busy || email.trim().length < 3}>
              {busy ? 'Sending…' : 'Email me a link'}
            </Button>
            {/*
              A way in for a code you were given rather than sent.

              The code field already existed on the next screen, but the only
              route to it was the button above — and that button calls
              `signInWithOtp`, which mints a fresh token and invalidates any code
              issued beforehand. So a recovery code handed over by hand was
              always dead by the time there was anywhere to type it. It looked
              like the code was wrong; the code was fine and the door was.

              This matters more than it sounds. On the free tier the email
              carries a link and no code, and a link can only ever open a
              browser — never an installed iOS web app, which has its own storage
              and its own empty session. For anyone on an iPhone home screen this
              is the only route in that works at all.
            */}
            <Button
              type="button"
              variant="quiet"
              accent={tint}
              disabled={email.trim().length < 3}
              onClick={() => {
                setError(null);
                setSentTo(email.trim());
                setGiven(true);
              }}
            >
              I already have a code
            </Button>
            <Button type="button" variant="quiet" accent={tint} onClick={cancelSignIn}>
              Back
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="flex flex-col gap-5">
            {/*
              The email carries a link, not a code — custom email templates are
              a paid feature when using Supabase's own mail service, and the
              default template contains only `{{ .ConfirmationURL }}`. Opening
              the link signs you in directly; `detectSessionInUrl` on the client
              picks up the tokens it comes back with.

              The code field stays because it costs nothing and is the better
              path the moment custom SMTP is configured — and because it is how
              `pnpm devlink` gets a tester in without any email at all.
            */}
            {!given && (
              <div className="bg-surface mb-2 rounded-2xl p-4">
                <p className="text-[0.95rem] leading-relaxed">
                  Check {sentTo} and open the link — it signs you straight in.
                </p>
                <p className="text-ash mt-2 text-sm leading-relaxed">
                  Open it on this device. It works once and expires in an hour.
                </p>
                {/*
                  The trap, said out loud, because it is invisible until you are
                  already in it: an iPhone home-screen app has its own storage,
                  so a link opened in Safari signs you into Safari and the icon
                  on the home screen stays empty.
                */}
                {isInstalledOnIOS() && (
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: tint }}>
                    You are in the installed app — the link will open your browser and sign you in
                    there instead. Ask for a code and type it here.
                  </p>
                )}
              </div>
            )}

            <Field
              label={given ? `The code for ${sentTo}` : 'Or paste a code, if you have one'}
              hint={
                given ? 'Six or eight digits. It works once.' : 'Only some sign-ins send a code.'
              }
              error={error}
            >
              {/*
                Not hard-capped at six. Supabase's OTP length is a project
                setting and its admin-generated codes are eight digits, so a
                six-character cap silently truncated the code and every attempt
                failed with "invalid token".
              */}
              <TextInput
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={10}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="counter text-center text-2xl tracking-[0.4em]"
              />
            </Field>
            <Button accent={tint} disabled={busy || code.length < 6}>
              {busy ? 'Checking…' : 'Continue'}
            </Button>
            <Button
              type="button"
              variant="quiet"
              accent={tint}
              onClick={() => {
                setSentTo(null);
                setGiven(false);
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
