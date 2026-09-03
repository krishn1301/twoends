import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { useIsV2 } from '../design/version.ts';
import { ChatIcon, HomeIcon, PairIcon, PlayIcon } from './icons.tsx';

/**
 * A floating translucent bar, the way both reference apps do it — it keeps the
 * black reaching the bottom bezel instead of ending in a grey slab, which on an
 * OLED panel is most of why they look like they do.
 *
 * Four destinations, not five. The build plan caps it at five, and Play earned
 * the fourth slot rather than being given it: it is somewhere you go, it has
 * state of its own that persists between visits, and it is the answer to the
 * evening when neither of you has anything to report. The label only appears on
 * the active tab, so four still fits comfortably on a 360dp phone.
 *
 * **Nothing here positions itself in JavaScript.** There was a `visualViewport`
 * correction for a while, subtracting the difference between the visual and
 * layout viewports so the bar would sit on the bottom of what you could
 * actually see. It is a correct idea and it made things worse: `offsetTop`
 * moves while you rubber-band a page, so the bar rode up and down with the
 * finger dragging the screen. The viewport problem is solved one floor down,
 * in `theme.css`, by making every page scrollable so there is no second
 * viewport size to be caught between.
 */
const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'dates', label: 'Dates', Icon: ChatIcon },
  { id: 'play', label: 'Play', Icon: PlayIcon },
  { id: 'us', label: 'Us', Icon: PairIcon },
] as const;

export type TabId = (typeof TABS)[number]['id'];

export function TabBar({
  current = 'home',
  onSelect,
}: {
  current?: TabId;
  onSelect?: (id: TabId) => void;
}) {
  const v2 = useIsV2();

  const strip = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<TabId, HTMLButtonElement>());
  const dragging = useRef(false);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  /*
    Where the lit pill sits, measured rather than guessed.

    The active tab is the only one that shows its label, so the buttons are not
    the same width and no amount of arithmetic gets this right — it has to come
    off the element. `useLayoutEffect` because a measurement taken after paint
    shows the pill in the old place for a frame.
  */
  const measure = useCallback(() => {
    const box = strip.current;
    const active = tabs.current.get(current);
    if (!box || !active) return;

    const a = active.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    setPill({ x: a.left - b.left, w: a.width });
  }, [current]);

  useLayoutEffect(() => {
    measure();
    // The label appears as the tab becomes active, so the width settles a beat
    // after the class does. Fonts landing late move it too.
    const again = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(again);
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  /*
    Drag along the bar and the tab under your thumb opens, the way it does in
    the app this was measured against. A tap is the same gesture with no
    travel, so there is one code path and no click handler to disagree with it.

    Pointer capture keeps the moves coming after the finger leaves the button it
    started on — without it the first slide off the edge ends the gesture.
  */
  const pickAt = useCallback(
    (clientX: number) => {
      for (const [id, el] of tabs.current) {
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && id !== current) {
          onSelect?.(id);
          return;
        }
      }
    },
    [current, onSelect],
  );

  return (
    <>
      {/*
        A short fade under the bar, at the size that was asked for.

        There was a hundred-and-twelve pixel one here once and it read as a
        bezel — on an app whose background is already black, that much of it
        does not look like a soft edge, it looks like the screen ending early.
        Twenty-eight is enough to stop a headline being sliced in half at the
        very bottom and short enough that nobody reads it as furniture.
      */}
      {v2 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-7"
          style={{ background: 'linear-gradient(to top, var(--color-void), transparent)' }}
        />
      )}

      <nav
        aria-label="Main"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-5"
        style={{
          /*
            Inside the home-indicator inset rather than clear of it, which is
            where the reference app puts its capsule — about 13pt off the edge
            on an iPhone against our 34. Nothing overlaps the indicator itself;
            there is simply no reason for a floating pill to leave the whole
            band empty underneath it.
          */
          paddingBottom: v2
            ? 'max(0.75rem, calc(env(safe-area-inset-bottom) - 1rem))'
            : 'max(0.85rem, env(safe-area-inset-bottom))',
        }}
      >
        <div
          ref={strip}
          onPointerDown={(e) => {
            dragging.current = true;
            /*
              Capture keeps the moves coming once the finger leaves the button
              it started on. It is also allowed to fail — a pointer id that is
              no longer live throws — and a throw here would take the selection
              with it, so the gesture is tracked in a ref and the capture is
              only an improvement on top of that.
            */
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              // No capture. A drag that leaves the bar simply stops early.
            }
            pickAt(e.clientX);
          }}
          onPointerMove={(e) => {
            if (dragging.current) pickAt(e.clientX);
          }}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          onLostPointerCapture={() => (dragging.current = false)}
          className={`pointer-events-auto relative flex touch-none gap-1 rounded-full border p-1.5 ${
            v2 ? 'border-white/12 backdrop-blur-2xl' : 'border-white/10 backdrop-blur-xl'
          }`}
          style={{ background: v2 ? 'rgba(20,17,15,0.62)' : 'rgba(28,24,21,0.82)' }}
        >
          {/*
            One lit pill that slides, rather than four that switch on and off.
            It is the only thing in the bar that moves, and it is what makes a
            drag across the bar read as carrying something rather than as four
            separate taps landing in a row.
          */}
          {pill && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 bottom-1.5 left-0 rounded-full bg-white/12 transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ transform: `translateX(${pill.x}px)`, width: pill.w }}
            />
          )}

          {TABS.map(({ id, label, Icon }) => {
            const active = id === current;
            return (
              <button
                key={id}
                type="button"
                ref={(el) => {
                  if (el) tabs.current.set(id, el);
                  else tabs.current.delete(id);
                }}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                /*
                  The gesture above already selects, on pointerdown and on every
                  move. Leaving an onClick here as well would fire a second
                  selection on release — harmless today, and exactly the kind of
                  thing that stops being harmless when one of these gets a
                  confirmation. Keyboards still need it, hence the key handler.
                */
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect?.(id);
                  }
                }}
                className={`relative z-10 flex items-center gap-2 rounded-full ${
                  active ? 'text-chalk px-5' : 'text-ash px-4'
                }`}
              >
                <Icon />
                {active && <span className="text-sm font-medium">{label}</span>}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
