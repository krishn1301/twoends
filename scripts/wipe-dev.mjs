#!/usr/bin/env node
/**
 * Empties the development project: every user, every storage object.
 *
 *     pnpm wipe:dev
 *
 * Deleting the users cascades through profiles, couples and everything
 * couple-scoped. Storage does not cascade — objects are reached by path, not by
 * foreign key — so they are removed explicitly, which is the same reason
 * unpairing has to delete them from the client before the rows go.
 *
 * Refuses to run unless `.env.local` says this is a development project. There
 * is no undo, and the difference between the two projects is one line in a file.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}

if (env.SUPABASE_ENV !== 'development') {
  console.error('\nRefusing to wipe: .env.local is not marked SUPABASE_ENV=development.\n');
  process.exit(1);
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`\nWiping ${env.VITE_SUPABASE_URL}\n`);

// ── storage ──────────────────────────────────────────────────────────────────

for (const bucket of ['photos', 'covers', 'avatars']) {
  const { data: folders, error } = await admin.storage.from(bucket).list('', { limit: 1000 });
  if (error) {
    console.log(`  ${bucket}: ${error.message}`);
    continue;
  }

  let removed = 0;
  for (const folder of folders ?? []) {
    const { data: files } = await admin.storage.from(bucket).list(folder.name, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${folder.name}/${f.name}`);
    if (paths.length === 0) continue;

    const { error: rmError } = await admin.storage.from(bucket).remove(paths);
    if (rmError) console.log(`  ${bucket}: ${rmError.message}`);
    else removed += paths.length;
  }
  console.log(`  ${bucket}: removed ${removed} object(s)`);
}

// ── users, and everything that cascades from them ────────────────────────────

const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

for (const user of data.users) {
  await admin.auth.admin.deleteUser(user.id);
}
console.log(`  auth: deleted ${data.users.length} user(s)`);

// ── prove it ─────────────────────────────────────────────────────────────────

const counts = {};
for (const table of ['profiles', 'couples', 'photos', 'canvases', 'answers', 'countdowns']) {
  const { count } = await admin.from(table).select('id', { count: 'exact', head: true });
  counts[table] = count ?? 0;
}

console.log('\nRemaining rows:', counts);
console.log(
  Object.values(counts).every((n) => n === 0)
    ? '\nClean. Prompts are left alone — they are shared content, not anyone’s data.\n'
    : '\nSomething survived. Look above.\n',
);
