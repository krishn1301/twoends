import { useEffect } from 'react';

import { supabase } from '../lib/supabase.ts';
import { useSession } from './session.ts';

/**
 * Watches for the partner accepting the invite, while the inviter stares at a
 * six-character code.
 *
 * Three mechanisms, because this moment is the one that must not be missed and
 * each of them fails in a different way:
 *
 * 1. **Realtime.** Instant when it works. It silently delivers nothing if the
 *    table is not published, which is exactly the bug this hook was written to
 *    fix, so it is not trusted on its own.
 * 2. **Coming back to the app.** The single most likely sequence by far: copy
 *    the code, leave for WhatsApp, send it, come back. `visibilitychange` catches
 *    a partner who joined while the app was in the background — and on a phone
 *    the app is suspended then, so nothing else could have noticed.
 * 3. **A slow poll.** Every eight seconds, as the floor. Enough that a stuck
 *    screen resolves itself within one glance, cheap enough not to matter
 *    against a free-tier database.
 *
 * The poll stops as soon as a partner arrives.
 */
export function useWaitForPartner(enabled: boolean): void {
  const refresh = useSession((s) => s.refresh);
  const coupleId = useSession((s) => s.couple?.id);

  useEffect(() => {
    if (!enabled || !coupleId) return;

    const check = () => void refresh();

    const channel = supabase
      .channel(`waiting:${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'couples', filter: `id=eq.${coupleId}` },
        check,
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);

    const poll = window.setInterval(check, 8000);

    return () => {
      void supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
    };
  }, [enabled, coupleId, refresh]);
}
