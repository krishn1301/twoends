#!/usr/bin/env node
/**
 * Prints a sign-in link for a given email, without sending any email.
 *
 *     pnpm devlink you@example.com
 *
 * Why this exists: Supabase's built-in mail service only delivers to addresses
 * belonging to the project organisation's members, and rate-limits to a couple
 * of messages an hour. That is fine in production — real deployments use their
 * own SMTP — but during development it turns every sign-in into a wait, or a
 * silence, with no signal about which.
 *
 * This asks the admin API to generate the same link the email would have
 * contained. It needs the service-role key, so it only ever runs on a machine
 * that already has `.env.local`. Nothing here ships.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) {
  console.error('\nUsage: pnpm devlink you@example.com\n');
  process.exit(1);
}

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}

if (env.SUPABASE_ENV !== 'development') {
  console.error('\nRefusing to run: .env.local is not marked SUPABASE_ENV=development.\n');
  process.exit(1);
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });

if (error) {
  // A brand-new address has no user yet; make one, then link it.
  if (/not found|does not exist/i.test(error.message)) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error) {
      console.error(`\nCould not create ${email}: ${created.error.message}\n`);
      process.exit(1);
    }
    const retry = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (retry.error) {
      console.error(`\n${retry.error.message}\n`);
      process.exit(1);
    }
    printLink(retry.data);
  } else {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }
} else {
  printLink(data);
}

function printLink(data) {
  const props = data.properties ?? {};
  console.log(`\nSign-in link for ${email}\n`);
  console.log(`  ${props.action_link}\n`);
  console.log(`Or type this six-digit code into the app:  ${props.email_otp}\n`);
  console.log('Both are single-use and expire in an hour.\n');
}
