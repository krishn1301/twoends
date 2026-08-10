#!/usr/bin/env node
/**
 * Runs the RLS leak suite against the local Supabase stack.
 *
 * Reads the stack's keys from the CLI rather than hardcoding them. The local
 * demo keys have been stable for years, which is exactly why hardcoding them is
 * tempting and wrong: the day they rotate, a hardcoded key produces an
 * authentication failure that reads like a policy failure, and someone spends
 * an afternoon debugging security rules that were fine.
 */
import { spawnSync } from 'node:child_process';

const status = spawnSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (status.status !== 0) {
  console.error(
    '\nCould not reach the local Supabase stack.\n' +
      '  pnpm db:start   — starts it (first run pulls a few GB of images)\n',
  );
  console.error(status.stderr?.trim() ?? '');
  process.exit(1);
}

/** `KEY="value"` per line. */
const env = { ...process.env };
for (const line of status.stdout.split('\n')) {
  const match = /^([A-Z_]+)="?([^"]*)"?$/.exec(line.trim());
  if (!match) continue;
  const [, key, value] = match;
  if (key === 'API_URL') env.SUPABASE_URL = value;
  if (key === 'ANON_KEY') env.SUPABASE_ANON_KEY = value;
  if (key === 'SERVICE_ROLE_KEY') env.SUPABASE_SERVICE_ROLE_KEY = value;
}

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Supabase is running but did not report a service role key.');
  process.exit(1);
}

const run = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', '--config', 'vitest.rls.config.ts', ...process.argv.slice(2)],
  { stdio: 'inherit', env, shell: process.platform === 'win32' },
);

process.exit(run.status ?? 1);
