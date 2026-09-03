import { useEffect, useRef } from 'react';

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
 */
const TABS = [
  { id: 'home', label: 'Home', Icon: HomeIcon },
  { id: 'dates', label: 'Dates', Icon: ChatIcon },
  { id: 'play', label: 'Play', Icon: PlayIcon },
  { id: 'us', label: 'Us', Icon: PairIcon },
] as const;

export type TabId = (typeof TABS)[number]['id'];

/**
 * How far the bar is allowed to be nudged, in CSS pixels.
 *
 * The corrections this is for are safe-area sized — the largest seen on the
 * device is 47. A soft keyboard shrinks the visible area by two or three
 * hundred, and a bar that rode up on top of the keyboard would be a new bug
 * rather than a fix, so anything past this is somebody typing and is ignored.
 */
const MOST = 64;

export function TabBar({
  current = 'home',
  onSelect,
}: {
  current?: TabId;
  onSelect?: (id: TabId) => void;
}) {
  const v2 = useIsV2();
  const nav = useRef<HTMLElement>(null);

  /*
    Put the bar on the bottom of what you can actually see.

    `position: fixed; bottom: 0` is measured against the *layout* viewport, and
    on iOS that is not the same box as the screen. It is the reason this has now
    been wrong twice in opposite directions: anchored to it, the bar sits 45 CSS
    px above the bottom on one screen and 81 on another; pinned to a shell sized
    to it, the bar held still and the last 47 px of the phone went dead.

    `visualViewport` is the box the user is looking at, and it reports its own
    offset from the layout viewport. The difference between the two is exactly
    the error, so it is subtracted rather than guessed at. Nothing here assumes
    a number, a device, or which of the two boxes is bigger — it reads both and
    closes the gap, on every resize and every visual scroll.

    Android and the APK have no gap and get a translate of zero.
  */
  useEffect(() => {
    const vv = window.visualViewport;
    const el = nav.current;
    if (!vv || !el) return;

    const apply = () => {
      // Rounded: the visual height is fractional, so an untouched viewport
      // otherwise leaves a fifth of a pixel of transform on the element.
      const gap = Math.round(window.innerHeight - (vv.offsetTop + vv.height));
      const shift = Math.abs(gap) > MOST ? 0 : -gap;
      el.style.transform = shift === 0 ? '' : `translateY(${shift}px)`;
    };

    apply();
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);

    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

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
        ref={nav}
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
        {/*
          Content passes behind it and stays readable, which is the whole of
          what a floating bar is for. It was briefly the opposite — 94% opaque,
          with a black gradient rising a hundred pixels behind it to stop
          anything being sliced in half. On an app whose background is already
          black that does not read as a soft edge, it reads as dead space at the
          bottom of the screen. The bar is see-through and the fade is short.
        */}
        <div
          className={`pointer-events-auto flex gap-1 rounded-full border p-1.5 ${
            v2 ? 'border-white/12 backdrop-blur-2xl' : 'border-white/10 backdrop-blur-xl'
          }`}
          style={{ background: v2 ? 'rgba(20,17,15,0.62)' : 'rgba(28,24,21,0.82)' }}
        >
          {TABS.map(({ id, label, Icon }) => {
            const active = id === current;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelect?.(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={label}
                className={`flex items-center gap-2 rounded-full transition-colors ${
                  active ? 'text-chalk bg-white/12 px-5' : 'text-ash px-4'
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
