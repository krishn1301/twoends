import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Test rig for the leak suite. Talks to the local Supabase stack only.
 *
 * Everything here fails loudly rather than skipping. A security suite that
 * quietly does nothing when the database is unreachable is worse than no suite
 * at all, because the green tick still appears.
 */

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';

const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function requireKeys(): { anon: string; service: string } {
  if (!ANON_KEY || !SERVICE_KEY) {
    throw new Error(
      'The RLS leak suite needs a running local Supabase stack.\n' +
        '  pnpm db:start   (then re-run)\n' +
        'It refuses to skip: a security suite that silently passes is worse ' +
        'than no suite, because the green tick still appears.',
    );
  }
  return { anon: ANON_KEY, service: SERVICE_KEY };
}

/** Service-role client. Bypasses RLS — used only to seed and to inspect. */
export function adminClient(): SupabaseClient {
  const { service } = requireKeys();
  return createClient(SUPABASE_URL, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** An anonymous client, before sign-in. */
export function anonClient(): SupabaseClient {
  const { anon } = requireKeys();
  return createClient(SUPABASE_URL, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  /** A client carrying this user's session — subject to RLS, like the real app. */
  db: SupabaseClient;
}

/**
 * Creates a confirmed user and returns a client signed in as them.
 *
 * The session-bearing client is the whole point: `auth.uid()` inside every
 * policy resolves from this JWT, so these clients see exactly what the shipped
 * app would see.
 */
export async function createUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@twoends.test`;
  const password = crypto.randomUUID();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error ?? !data.user) throw new Error(`createUser(${label}): ${error?.message}`);

  const db = anonClient();
  const signIn = await db.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`signIn(${label}): ${signIn.error.message}`);

  return { id: data.user.id, email, db };
}

/** Removes every user this run created, so repeat runs start clean. */
export async function deleteUsers(users: TestUser[]): Promise<void> {
  const admin = adminClient();
  for (const u of users) {
    await admin.auth.admin.deleteUser(u.id);
  }
}

/**
 * Every couple-scoped table, and a minimal valid row for each.
 *
 * Kept as data rather than a pile of per-table test cases so that adding a
 * table to the schema without adding it here is visible in one diff — and so
 * the "did we cover every table?" test below can compare this list against the
 * database's own catalogue.
 */
export const COUPLE_TABLES = [
  'prompt_days',
  'answers',
  'streaks',
  'canvases',
  'photos',
  'countdowns',
  'journal_entries',
  'list_items',
  'capsules',
] as const;

export type CoupleTable = (typeof COUPLE_TABLES)[number];
