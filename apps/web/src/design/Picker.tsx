export type OptionId = 'a' | 'b' | 'c';

const OPTIONS: Array<{ id: OptionId; name: string }> = [
  { id: 'a', name: 'Night seam' },
  { id: 'b', name: 'Paper seam' },
  { id: 'c', name: 'Cards' },
];

/**
 * Phase 0 scaffolding, deleted the moment a direction wins.
 *
 * It floats rather than sitting in the layout so each shell renders edge to edge
 * exactly as it would ship — a picker that pushed the content up would change
 * the thing being judged.
 */
export function Picker({ current }: { current: OptionId }) {
  return (
    <nav
      aria-label="Design options"
      className="fixed inset-x-0 z-50 flex justify-center"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex gap-1 rounded-full border border-white/15 bg-black/75 p-1 backdrop-blur-md">
        {OPTIONS.map((o) => {
          const active = o.id === current;
          return (
            <a
              key={o.id}
              href={`#/design/${o.id}`}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center rounded-full px-4 text-sm font-medium transition-colors ${
                active ? 'bg-white text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              {o.name}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
