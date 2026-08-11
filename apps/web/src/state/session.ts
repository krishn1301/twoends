import type { AccentKey } from '@twoends/core';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { wipeLocal } from '../db/schema.ts';
import { supabase } from '../lib/supabase.ts';

/**
 * Who is using this app, and how far through the setup they are.
 *
 * There is no sign-in wall. Opening the app gets you an anonymous account and
 * the first question, because asking someone to prove who they are before
 * showing them anything is a strange way to greet them — and because email
 * delivery is a thing that can be broken by a provider you do not control.
 *
 * Email is not the front door. It is the fire escape: offered once, after
 * pairing, when there is finally something worth not losing. Until then the
 * account lives in this browser's storage, which is honest but fragile, and the
 * app says so rather than pretending otherwise.
 */

export type RelationshipType =
  'together' | 'long_distance' | 'situationship' | 'friends' | 'complicated';

export interface Profile {
  id: string;
  display_name: string;
  accent_key: AccentKey | null;
  birthday: string | null;
}

export interface Couple {
  id: string;
  member_a: string;
  member_b: string | null;
  started_on: string | null;
  relationship_type: RelationshipType | null;
  unpair_requested_by: string | null;
}

export type Status =
  /** Working out who this is, or making an anonymous account. Renders nothing. */
  | 'loading'
  /** Deliberately signing in to an existing account from a new device. */
  | 'signing-in'
  /** Has an account, no profile yet — the questions have not been answered. */
  | 'onboarding'
  /** Has a profile, no partner. A real state with real things to do. */
  | 'solo'
  | 'paired';

interface SessionState {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  couple: Couple | null;
  partner: Profile | null;
  /** True while the account has no email and could be lost with this browser. */
  isAnonymous: boolean;
  error: string | null;

  bootstrap: () => () => void;
  refresh: () => Promise<void>;
  beginSignIn: () => void;
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
}

function statusFor(
  session: Session | null,
  profile: Profile | null,
  couple: Couple | null,
): Status {
  if (!session) return 'loading';
  if (!profile) return 'onboarding';
  return couple?.member_b ? 'paired' : 'solo';
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  session: null,
  profile: null,
  couple: null,
  partner: null,
  isAnonymous: false,
  error: null,

  bootstrap: () => {
    void (async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        /*
          No session: make one, silently, and let them straight in. If anonymous
          sign-in is switched off for the project this is the only thing that
          fails, and it fails loudly here rather than mysteriously three screens
          later.
        */
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          set({
            status: 'signing-in',
            error:
              'Could not start a session. Enable anonymous sign-ins in the Supabase dashboard, or sign in with an email.',
          });
          return;
        }
      }

      await get().refresh();
    })();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      void get().refresh();
    });

    return () => data.subscription.unsubscribe();
  },

  refresh: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;

    if (!session) {
      set({ status: get().status === 'signing-in' ? 'signing-in' : 'loading' });
      return;
    }

    const [profileRes, coupleRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, display_name, accent_key, birthday')
        .eq('id', session.user.id)
        .maybeSingle(),
      supabase
        .from('couples')
        .select('id, member_a, member_b, started_on, relationship_type, unpair_requested_by')
        .maybeSingle(),
    ]);

    const profile = (profileRes.data as Profile | null) ?? null;
    const couple = (coupleRes.data as Couple | null) ?? null;

    let partner: Profile | null = null;
    if (couple?.member_b) {
      const partnerId = couple.member_a === session.user.id ? couple.member_b : couple.member_a;
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, accent_key, birthday')
        .eq('id', partnerId)
        .maybeSingle();
      partner = (data as Profile | null) ?? null;
    }

    set({
      session,
      profile,
      couple,
      partner,
      // Supabase marks these on the user; an account with an email is one that
      // survives losing this device.
      isAnonymous: session.user.is_anonymous === true || !session.user.email,
      status: statusFor(session, profile, couple),
      error: profileRes.error?.message ?? coupleRes.error?.message ?? null,
    });
  },

  beginSignIn: () => set({ status: 'signing-in', error: null }),

  cancelSignIn: () => void get().refresh(),

  signOut: async () => {
    await supabase.auth.signOut();
    // The local mirror goes with the session. Leaving the pair's words in
    // IndexedDB for whoever opens the browser next would make sign-out a lie.
    await wipeLocal();
    set({
      status: 'loading',
      session: null,
      profile: null,
      couple: null,
      partner: null,
      isAnonymous: false,
    });
    // Straight back to a fresh anonymous account rather than a wall.
    await supabase.auth.signInAnonymously();
    await get().refresh();
  },
}));

/** `?invite=ABC123` from a shared link, so the code is prefilled rather than retyped. */
export function inviteCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('invite');
  return code ? code.toUpperCase().trim() : null;
}
