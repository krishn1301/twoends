import { useEffect, useState } from 'react';

import { onOutboxChange } from '../db/outbox.ts';
import { db } from '../db/schema.ts';

/**
 * How much is written here but not yet on the server.
 *
 * Worth surfacing rather than hiding. "3 to sync" tells someone their words are
 * safe on the device and simply have not travelled yet — which is a different
 * and much calmer thing than a spinner, or than silence.
 */
export function useOutbox(): { pending: number; flushing: boolean } {
  const [state, setState] = useState({ pending: 0, flushing: false });

  useEffect(() => {
    void db.outbox.count().then((pending) => setState((s) => ({ ...s, pending })));
    return onOutboxChange(setState);
  }, []);

  return state;
}
