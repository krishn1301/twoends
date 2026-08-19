import {
  useCallback,
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * The app's first gestures, and the only implementation of them.
 *
 * Three things on Home are worth pressing and none of them says so. That is the
 * design — *"they should not be obvious"* — but it puts a real constraint on how
 * they are attached: **a hidden gesture must not change the element it is on.**
 *
 * `Tile` renders an `<article>` unless it is given `onClick`, and its own
 * contract says "cards that do nothing take no handler". Turning a card into a
 * `<button>` to hold it would announce it to a screen reader as actionable and
 * give it a focus ring, which is precisely the opposite of hidden — and would
 * also promise a keyboard user something a keyboard cannot do. So these hooks
 * return pointer handlers to spread, and nothing else. The markup is unchanged.
 *
 * Pointer events rather than touch events, because the same code then works on
 * the laptop where it is developed. `setPointerCapture` is deliberately *not*
 * used: capturing would keep delivering moves after the finger leaves the
 * element, and leaving the element is exactly the signal to give up on the
 * press.
 */

/** How far a finger may drift and still count as holding still, in pixels. */
const SLOP = 10;

/**
 * A press held down without moving.
 *
 * The two failure modes are opposite and both matter. Too short and it fires
 * while somebody is scrolling a rail, which turns a hidden delight into a screen
 * that keeps interrupting. Too long and nobody ever discovers it. 550ms is a
 * little above Android's own ~500ms long-press so a launcher-trained thumb finds
 * it, and well above the ~120ms a scroll takes to start moving.
 *
 * `body` carries `touch-action: manipulation`, which suppresses double-tap zoom
 * and the 300ms click delay but leaves pointerdown/up alone — so this is
 * unaffected by it, and does not need `touch-action: none` the way `DrawSurface`
 * does.
 */
export function useLongPress(
  onLongPress: () => void,
  { ms = 550, onRelease }: { ms?: number; onRelease?: () => void } = {},
) {
  const timer = useRef(0);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    origin.current = null;
    if (fired.current) {
      fired.current = false;
      onRelease?.();
    }
  }, [onRelease]);

  // A press that is still held when the component goes away must not fire into
  // a screen that is no longer there.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      origin.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const from = origin.current;
      if (!from) return;
      if (Math.abs(e.clientX - from.x) > SLOP || Math.abs(e.clientY - from.y) > SLOP) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    /*
      Android's WebView answers a long press with a text-selection handle and a
      context menu, over the top of whatever this was about to reveal. There is
      no way to opt out of that per-gesture, only to refuse the menu.
    */
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };
}

/**
 * A run of taps in quick succession.
 *
 * The window resets on each tap rather than running from the first, so a slow
 * deliberate five taps works and a stray double-tap two seconds ago does not
 * count towards it. Somebody trying this will not tap at a metronome.
 *
 * Returns an `onClick`, which means whatever it is attached to must already be
 * something you can click — the wordmark is a heading, so it gets one. It does
 * not make anything focusable, for the same reason as above.
 */
export function useTapRun(count: number, onReached: () => void, { windowMs = 1500 } = {}) {
  const runLength = useRef(0);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return {
    onClick: () => {
      window.clearTimeout(timer.current);
      runLength.current += 1;

      if (runLength.current >= count) {
        runLength.current = 0;
        onReached();
        return;
      }

      timer.current = window.setTimeout(() => {
        runLength.current = 0;
      }, windowMs);
    },
  };
}

/**
 * Two things held at once — one thumb on each.
 *
 * The gesture is the meaning here: the two faces have to be touched together,
 * by two fingers, before they will do anything. One at a time achieves nothing
 * however long you hold it.
 *
 * Returns one set of handlers per side. Both are tracked by pointer id rather
 * than by a boolean, because a finger that slides off one avatar and back on
 * would otherwise leave a stale "still down" behind it forever.
 */
export function useBothPressed(onBoth: () => void, { onRelease }: { onRelease?: () => void } = {}) {
  const down = useRef<[number | null, number | null]>([null, null]);
  const fired = useRef(false);

  const press = (side: 0 | 1) => (e: ReactPointerEvent) => {
    down.current[side] = e.pointerId;
    if (down.current[0] !== null && down.current[1] !== null && !fired.current) {
      fired.current = true;
      onBoth();
    }
  };

  const lift = (side: 0 | 1) => () => {
    down.current[side] = null;
    if (fired.current && down.current[0] === null && down.current[1] === null) {
      fired.current = false;
      onRelease?.();
    }
  };

  const side = (index: 0 | 1) => ({
    onPointerDown: press(index),
    onPointerUp: lift(index),
    onPointerCancel: lift(index),
    onPointerLeave: lift(index),
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  });

  return { first: side(0), second: side(1) };
}
