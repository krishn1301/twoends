#!/usr/bin/env node
/**
 * Removes what testing left behind in the development project.
 *
 *     pnpm sweep:dev            # says what it would do, changes nothing
 *     pnpm sweep:dev --commit   # does it
 *
 * This replaces `wipe:dev`, which deleted every user and every storage object.
 * That was the right tool for a project holding fixtures and the wrong one for
 * this project, which holds three real couples — and nothing about it had
 * changed except the data. Its only guard was `SUPABASE_ENV=development`, and
 * that is permanently set because `pnpm test:rls` refuses to run without it.
 *
 * So the rule is inverted: this deletes only accounts it can prove were made by
 * testing, prints everybody it is sparing and why, and refuses outright if the
 * classification would take a couple with it. See `lib/sweep.mjs`, where that
 * decision lives on its own so it can be tested against cases rather than
 * against live data.
 *
 * A dry run by default, because the useful thing about a destructive script is
 * usually the list it prints.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { classify, couplesDestroyedBy } from './lib/sweep.mjs';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}

if (env.SUPABASE_ENV !== 'development') {
  console.error('\nRefusing to sweep: .env.local is not marked SUPABASE_ENV=development.\n');
  process.exit(1);
}

const commit = process.argv.includes('--commit');

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`\n${commit ? 'Sweeping' : 'Dry run against'} ${env.VITE_SUPABASE_URL}\n`);

const [{ data: auth, error }, { data: profiles }, { data: couples }] = await Promise.all([
  admin.auth.admin.listUsers({ perPage: 1000 }),
  admin.from('profiles').select('id, display_name, avatar_path'),
  admin.from('couples').select('id, member_a, member_b'),
]);

if (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

const rows = classify({ users: auth.users, profiles: profiles ?? [], couples: couples ?? [] });
const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
const doomed = rows.filter((r) => r.verdict !== 'keep');
const kept = rows.filter((r) => r.verdict === 'keep');

// ── the list, before anything happens ────────────────────────────────────────

console.log(`keeping ${kept.length}:`);
for (const row of kept) {
  const name = byId.get(row.id)?.display_name ?? '—';
  console.log(`   ${row.id.slice(0, 8)}  ${(row.email ?? '(anonymous)').padEnd(30)} ${name.padEnd(14)} ${row.why}`);
}

const suite = doomed.filter((r) => r.verdict === 'test').length;
const abandoned = doomed.filter((r) => r.verdict === 'abandoned').length;
console.log(`\ndeleting ${doomed.length}: ${suite} from the leak suite, ${abandoned} abandoned`);

// ── the check that stops the run ─────────────────────────────────────────────

const lost = couplesDestroyedBy(
  doomed.map((r) => r.id),
  couples ?? [],
);

if (lost.length > 0) {
  /*
    Unreachable if `classify` is right, which is why reaching it is fatal rather
    than something to work around. `couples.member_a references profiles on
    delete cascade`, so one wrong id here takes a whole couple and everything
    keyed to its `couple_id` — including a partner who has an email and did
    nothing.
  */
  console.error(`\nSTOPPING. This would destroy ${lost.length} couple(s):`);
  for (const c of lost) console.error(`   ${c.id}`);
  console.error('\nThat should be impossible. Fix scripts/lib/sweep.mjs before running again.\n');
  process.exit(1);
}

if (!commit) {
  console.log('\nDRY RUN — nothing was changed. Pass --commit to do it.\n');
  process.exit(0);
}

if (doomed.length === 0) {
  console.log('\nNothing to sweep.\n');
  process.exit(0);
}

// ── avatars first, while the profile row still names the path ────────────────

const avatars = doomed.map((r) => byId.get(r.id)?.avatar_path).filter(Boolean);
if (avatars.length > 0) {
  // Storage has no foreign keys, so an object outlives the person it belonged
  // to and nothing ever comes looking for it again.
  const { error: rmError } = await admin.storage.from('avatars').remove(avatars);
  console.log(`\navatars removed: ${avatars.length}${rmError ? ` (${rmError.message})` : ''}`);
}

let done = 0;
let failed = 0;
for (const row of doomed) {
  const { error: delError } = await admin.auth.admin.deleteUser(row.id);
  if (delError) {
    failed++;
    console.log(`   failed ${row.id.slice(0, 8)} — ${delError.message}`);
  } else done++;
}

console.log(`\ndeleted ${done}, failed ${failed}`);

// ── prove it ─────────────────────────────────────────────────────────────────

const [{ data: afterAuth }, { data: afterCouples }] = await Promise.all([
  admin.auth.admin.listUsers({ perPage: 1000 }),
  admin.from('couples').select('id'),
]);

console.log(`\n${afterAuth.users.length} users and ${afterCouples?.length ?? 0} couples remain.\n`);
