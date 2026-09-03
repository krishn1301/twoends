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

export function TabBar({
  current = 'home',
  onSelect,
}: {
  current?: TabId;
  onSelect?: (id: TabId) => void;
}) {
  const v2 = useIsV2();

  return (
    <>
      {/*
        Anchored at `bottom: 0` with the safe area as *padding*, not as the
        value of `bottom`.

        The bar was reported sitting about sixty CSS pixels higher on Dates than
        on Home, on an iPhone 13 installed as a PWA, and not at all on the
        Android APK. Measured off screenshots of the device: Home puts it 37px
        above the bottom edge, Dates 97px. Nothing in this component differs
        between the two screens, so the only thing that can differ is what
        `bottom: max(0.85rem, env(safe-area-inset-bottom))` resolves against —
        and on iOS that is the layout viewport, which the two pages give
        different heights because one of them scrolls and the other does not.

        `bottom: 0` has no length to resolve. The inset moves into
        `padding-bottom`, which is laid out inside the element and cannot be
        measured against the wrong box.

        Not reproducible here — there is no iPhone on this machine — so this
        is a targeted fix that needs confirming on the device that showed it.
      */}
      <nav
        aria-label="Main"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-50 flex justify-center px-5"
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
          bottom of the screen. The gradient is gone and the bar is see-through.
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
