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
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 z-50 flex justify-center px-5"
      style={{ bottom: 'max(0.85rem, env(safe-area-inset-bottom))' }}
    >
      <div
        className="flex gap-1 rounded-full border border-white/10 p-1.5 backdrop-blur-xl"
        style={{ background: 'rgba(28,24,21,0.82)' }}
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
  );
}
