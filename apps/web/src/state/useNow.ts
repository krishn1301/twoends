import { useEffect, useState } from 'react';

/**
 * The current time, as state.
 *
 * Reading `Date.now()` in a render body is impure — React may call a component
 * twice and get two answers — and the linter is right to reject it. Holding the
 * clock in state also gives the thing everything here actually needs: a value
 * that changes on its own, so a counter ticks and a countdown rolls over at
 * midnight without anyone touching the screen.
 *
 * Each tick re-anchors to the wall clock rather than adding a fixed interval.
 * `setInterval(fn, 1000)` fires *at least* a second later and the error
 * accumulates until the seconds digit visibly skips.
 */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setNow(new Date());
          schedule();
        },
        intervalMs - (Date.now() % intervalMs),
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [intervalMs]);

  return now;
}
