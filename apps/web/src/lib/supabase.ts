import type { Database } from '@twoends/core';
import { Capacitor } from '@capacitor/core';
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

/**
 * Where a sign-in link should come back to.
 *
 * Without this the app names no destination at all, and Supabase falls back to
 * the **Site URL** — a single text field in a dashboard that nothing in this
 * repository mentions, sets or checks. That is a bad place for the one value
 * that decides whether anybody can get into the app: if it is ever wrong, every
 * link in every inbox lands on a 404 and there is no commit, no test and no
 * error message anywhere that points at the cause. The failure looks like the
 * email is broken. It is not; the destination is.
 *
 * It also means a link is only ever useful to whoever is standing on the
 * production site. Ask for one from `localhost:5173` or from the laptop's LAN
 * address — which is the whole dev loop for the S9+ — and the mail sends you to
 * GitHub Pages instead of back to where you were.
 *
 * So: the page says where it is, because the page is the only thing that knows.
 * `BASE_URL` is `/twoends/` in the Pages build and `/` everywhere else, which is
 * exactly the difference between the two that keeps getting lost.
 *
 * **Every origin used here must also be in the project's Redirect URLs allow
 * list**, or Supabase silently ignores it and falls back to the Site URL again —
 * the same 404, now with a config that looks right.
 *
 * The one place it must *not* apply is the Android app. Capacitor serves the
 * bundle from `http://localhost`, so a link built from that origin points at the
 * phone itself and can never resolve. There is no route from a tapped email into
 * a WebView on any platform, so the honest fallback there is the website.
 */
export function signInReturnUrl(): string | undefined {
  if (Capacitor.isNativePlatform()) return undefined;
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString();
}

export type { Database };
