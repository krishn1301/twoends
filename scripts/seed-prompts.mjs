#!/usr/bin/env node
/**
 * Seeds the prompt packs into the database.
 *
 *     pnpm db:seed
 *
 * Idempotent: ids come from the text, so running this twice changes nothing and
 * running it after adding a prompt inserts exactly that one. Existing prompts
 * are never rewritten — editing wording in the JSON creates a new prompt, which
 * is deliberate, because two people may already have answered the old one.
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*?)"?\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}

// Same derivation as packages/core/src/daily.ts. Duplicated rather than
// imported because this script runs in plain Node against untranspiled source.
function hash(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicId(namespace, name) {
  const seed = `${namespace}::${name}`;
  const hex = (n) => n.toString(16).padStart(8, '0');
  const raw =
    hex(hash(seed)) + hex(hash(`${seed}::1`)) + hex(hash(`${seed}::2`)) + hex(hash(`${seed}::3`));
  return [
    raw.slice(0, 8),
    raw.slice(8, 12),
    `4${raw.slice(13, 16)}`,
    `8${raw.slice(17, 20)}`,
    raw.slice(20, 32),
  ].join('-');
}

const file = JSON.parse(
  readFileSync(new URL('../packages/core/content/prompts.json', import.meta.url), 'utf8'),
);

const rows = [];
for (const [key, pack] of Object.entries(file.packs)) {
  pack.prompts.forEach((body, i) => {
    rows.push({
      id: deterministicId('twoends.prompt', body),
      body,
      pack: key,
      is_adult: pack.isAdult,
      kind: 'conversation',
      sort_order: i,
    });
  });
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { error } = await admin.from('prompts').upsert(rows, { onConflict: 'id' });
if (error) {
  console.error(`\nSeeding failed: ${error.message}\n`);
  process.exit(1);
}

const { count } = await admin.from('prompts').select('id', { count: 'exact', head: true });
console.log(`\nSeeded ${rows.length} prompts across ${Object.keys(file.packs).length} packs.`);
console.log(`Database now holds ${count}.\n`);
