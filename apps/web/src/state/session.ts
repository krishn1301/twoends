import type { AccentKey, Proximity } from '@twoends/core';
import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { wipeLocal } from '../db/schema.ts';
import { supabase } from '../lib/supabase.ts';

/**
 * Who is using this app, and how far through the setup they are.
 *
 * The whole app is a state machine, not a set of URLs, so `status` decides what
 * renders. That is also why there is no router yet: adding one now would be a
 * dependency chosen before there is anything to route. Invite deep links are
 * read straight off `location.search`.
 *
 * `solo` is a first-class state, not an error. Most couple apps show a dead
 * screen until a partner joins; here it is where you make an invite, and the
 * app has to be pleasant before there are two of you.
 */

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
  proximity: Proximity | null;
  unpair_requested_by: string | null;
}

export type Status =
  /** Still working out who this is. Renders nothing rather than a flash of sign-in. */
  | 'loading'
  | 'signed-out'
  /** Signed in, but no profile row yet — onboarding has not finished. */
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
  error: string | null;

  bootstrap: () => () => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

function statusFor(
  session: Session | null,
  profile: Profile | null,
  couple: Couple | null,
): Status {
  if (!session) return 'signed-out';
  if (!profile) return 'onboarding';
  return couple?.member_b ? 'paired' : 'solo';
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  session: null,
  profile: null,
  couple: null,
  partner: null,
  error: null,

  /**
   * Call once from the app root. Returns an unsubscribe, and Supabase's auth
   * listener drives everything after — including the sign-in that completes in
   * another tab, and the token refresh that happens while the app is open.
   */
  bootstrap: () => {
    void supabase.auth.getSession().then(({ data }) => {
      set({ session: data.session });
      void get().refresh();
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
      void get().refresh();
    });

    return () => data.subscription.unsubscribe();
  },

  refresh: async () => {
    const session = get().session;
    if (!session) {
      set({ status: 'signed-out', profile: null, couple: null, partner: null });
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
        .select('id, member_a, member_b, started_on, proximity, unpair_requested_by')
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
      profile,
      couple,
      partner,
      status: statusFor(session, profile, couple),
      error: profileRes.error?.message ?? coupleRes.error?.message ?? null,
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    // The local mirror goes with the session. Leaving a copy of the pair's
    // photographs and words in IndexedDB for the next person to open the
    // browser would make "sign out" a lie, and this is a shared-laptop world.
    await wipeLocal();
    set({ status: 'signed-out', session: null, profile: null, couple: null, partner: null });
  },
}));

/** `?invite=ABC123` from a shared link, so the code is prefilled rather than retyped. */
export function inviteCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('invite');
  return code ? code.toUpperCase().trim() : null;
}
