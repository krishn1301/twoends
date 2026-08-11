#!/usr/bin/env node
/**
 * Runs the RLS leak suite against the linked Supabase project.
 *
 * This project does not use Docker, so there is no local stack to read keys
 * from — they come from `.env.local`, which is gitignored and never printed.
 *
 * The suite needs the service-role key, which bypasses every policy. That is
 * the point: it seeds the rows that the ordinary, policy-bound clients then
 * fail to read. It also means this file must never run against a project that
 * holds real couples' data — see the guard below.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ENV_FILE = new URL('../.env.local', import.meta.url);

function readEnvFile() {
  let text;
  try {
    text = readFileSync(ENV_FILE, 'utf8');
  } catch {
    console.error(
      '\n.env.local not found.\n\n' +
        'The leak suite runs against the linked Supabase project and needs:\n' +
        '  VITE_SUPABASE_URL\n' +
        '  VITE_SUPABASE_ANON_KEY\n' +
        '  SUPABASE_SERVICE_ROLE_KEY\n\n' +
        'Copy .env.example to .env.local and fill them from\n' +
        '  Dashboard → Project Settings → API\n',
    );
    process.exit(1);
  }

  const vars = {};
  for (const line of text.split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/.exec(line);
    if (match) vars[match[1]] = match[2];
  }
  return vars;
}

const vars = readEnvFile();
const url = vars.VITE_SUPABASE_URL;
const anon = vars.VITE_SUPABASE_ANON_KEY;
const service = vars.SUPABASE_SERVICE_ROLE_KEY;

const missing = [
  ['VITE_SUPABASE_URL', url],
  ['VITE_SUPABASE_ANON_KEY', anon],
  ['SUPABASE_SERVICE_ROLE_KEY', service],
]
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`\n.env.local is missing: ${missing.join(', ')}\n`);
  process.exit(1);
}

/*
  The suite creates and deletes users and writes throwaway rows. Running it
  against production would put test accounts in a real couple's project and,
  worse, the cleanup deletes users. Refuse unless the target is explicitly
  marked as a development project.
*/
if (vars.SUPABASE_ENV !== 'development') {
  console.error(
    '\nRefusing to run: .env.local does not set SUPABASE_ENV=development.\n\n' +
      'The leak suite creates and deletes users and writes throwaway rows.\n' +
      'Point it at a development project, and mark it as one.\n',
  );
  process.exit(1);
}

console.error(`Running the leak suite against ${url}\n`);

const run = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', '--config', 'vitest.rls.config.ts', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: anon,
      SUPABASE_SERVICE_ROLE_KEY: service,
    },
  },
);

process.exit(run.status ?? 1);
