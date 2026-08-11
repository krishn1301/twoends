import type { Database } from '@twoends/core';
import { createClient } from '@supabase/supabase-js';

/**
 * The one Supabase client.
 *
 * It lives in `apps/web` rather than `packages/core` on purpose: core has no
 * platform imports, and `packages/core/test/no-platform-imports.test.ts` fails
 * the build the moment `@supabase/*` appears there. The *types* are fine in core
 * — they are pure declarations with no runtime — which is why `Database` is
 * imported from there and the client is constructed here.
 *
 * Nothing in the UI should import this directly. From Phase 3 onward the screens
 * read Dexie and only the repository layer touches the network; a component that
 * imports this file is a component that breaks offline.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

/**
 * The anon key is public by design and ships in the bundle. Every table is
 * protected by row-level security, not by keeping this secret — which is exactly
 * why the leak suite is the gate on every merge.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    // Email OTP only; no passwords anywhere in this app.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type { Database };
