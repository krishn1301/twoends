/**
 * A sign-in code for an address, without sending an email.
 *
 *   pnpm signin:code you@example.com
 *
 * Why this exists. On the free tier Supabase's magic-link email carries a link
 * and no code, and a link can only ever open a *browser*. An iOS web app added
 * to the Home Screen has its own storage and its own empty session, so the link
 * signs you into Safari and leaves the app exactly as signed out as it was.
 * There is no way round that from inside the email.
 *
 * So the code comes from here instead, and goes in through the "I already have
 * a code" door on the sign-in screen — which deliberately does *not* call
 * `signInWithOtp` first, because that would mint a fresh token and kill this
 * one before you had anywhere to type it.
 *
 * `generateLink` does not email anything. It returns the token that
 * `verifyOtp({ type: 'email' })` on the client will accept, and prints it here.
 *
 * Guarded like `sweep:dev`: it refuses to run unless `.env.local` says this is
 * the development project, because a script that mints a login for an arbitrary
 * address should never be one command away from a real one.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}

if (env.SUPABASE_ENV !== 'development') {
  console.error('\nRefusing to run: .env.local is not marked SUPABASE_ENV=development.\n');
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('\nUsage: pnpm signin:code you@example.com\n');
  process.exit(1);
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/*
  Look first, and say what is there. A typo lands on an address with no account,
  and `shouldCreateUser` is `false` on the sign-in screen precisely so that a
  typo can no longer quietly become a second empty account — so the useful thing
  to print is which addresses *do* exist.
*/
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error('\nCould not read the user list:', listError.message, '\n');
  process.exit(1);
}

const found = list.users.find((u) => u.email?.toLowerCase() === email);

if (!found) {
  console.error(`\nNo account on ${email}.\n`);
  const near = list.users
    .filter((u) => u.email && u.email.toLowerCase().replace(/[^a-z@.]/g, '').includes(
      email.replace(/[^a-z@.]/g, '').slice(0, 8),
    ))
    .map((u) => u.email);
  if (near.length) console.error('Close matches that do exist:\n  ' + near.join('\n  ') + '\n');
  process.exit(1);
}

/*
  What the account actually is, so a code for an empty one is obvious before it
  is typed rather than after. `couple_id` is not on `profiles` — membership
  lives on `couples` — and a PostgREST select for a column that does not exist
  comes back null rather than as an error you would notice.
*/
const { data: profile, error: profileError } = await admin
  .from('profiles')
  .select('display_name')
  .eq('id', found.id)
  .maybeSingle();
if (profileError) console.error('profiles:', profileError.message);

const { data: couple, error: coupleError } = await admin
  .from('couples')
  .select('member_a, member_b')
  .or(`member_a.eq.${found.id},member_b.eq.${found.id}`)
  .maybeSingle();
if (coupleError) console.error('couples:', coupleError.message);

const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (error) {
  console.error('\nCould not generate a code:', error.message, '\n');
  process.exit(1);
}

const code = data.properties?.email_otp;
if (!code) {
  console.error('\nNo code came back. Supabase returned:', Object.keys(data.properties ?? {}), '\n');
  process.exit(1);
}

console.log(`
  ${email}
  name    ${profile?.display_name ?? '(no profile — onboarding was never finished)'}
  paired  ${couple ? (couple.member_a && couple.member_b ? 'yes' : 'half — no partner yet') : 'no'}

  code    ${code}

  Open the app, tap "I have used this before", enter the address, then
  "I already have a code" and type it. Do not tap "Email me a link" first:
  that mints a new token and this one stops working.

  It expires in an hour, and it is one use.
`);
