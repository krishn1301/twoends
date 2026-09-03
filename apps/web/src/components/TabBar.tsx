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
        The bar was reported as moving between screens. Measured off three
        screenshots of the real device, it does not: its top edge lands within
        four CSS pixels on every screen and it is centred to the pixel in all of
        them. What moves is what is behind it.

        On a short screen it sits over plain black. On Home it sits over the
        anniversary card, which passes underneath at 82% opacity — legible
        enough to notice and not enough to read, so the bar reads as a window
        onto moving content rather than as a fixed layer, and a card sliced in
        half by it reads as the bar having shifted.

        The fix is treatment, not position. Content dissolves into the page
        before it reaches the bar, and the bar itself is nearly opaque.
      */}
      {v2 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-40 h-28"
          style={{
            background: 'linear-gradient(to top, var(--color-void) 45%, transparent)',
          }}
        />
      )}

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
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-5"
        style={{ paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom))' }}
      >
        <div
          className="pointer-events-auto flex gap-1 rounded-full border border-white/10 p-1.5 backdrop-blur-xl"
          style={{ background: v2 ? 'rgba(20,17,15,0.94)' : 'rgba(28,24,21,0.82)' }}
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
