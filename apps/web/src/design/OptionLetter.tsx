import { WEEK_LABELS, useDesignModel } from './model.ts';
import { Avatar, Snapshot } from './parts.tsx';

/**
 * Letter — a page, not an interface.
 *
 * No cards. No tiles. A warm sheet with a wide margin, the date running down it,
 * and content set like something written rather than something rendered. The
 * snap is taped in at an angle with a white border, the way a photograph
 * actually ends up in a notebook.
 *
 * This is the furthest from what the category looks like, which is the argument
 * for it and also the risk: it is the hardest of the three to keep consistent
 * across twenty more screens in Phases 4 to 9.
 */
export function OptionLetter() {
  const m = useDesignModel();
  const ink = '#201b18';

  return (
    <div
      className="text-ink-text relative min-h-full"
      style={{
        colorScheme: 'light',
        // Warm sheet with a faint tint pulled toward whoever the app is waiting
        // on — the seam idea, reduced to a wash you notice without looking at it.
        background: `radial-gradient(120% 80% at 78% 0%, color-mix(in oklab, ${m.theirAccent.onLight} 11%, #F4EFEA), #F4EFEA 62%)`,
      }}
    >
      {/* The margin rule, like a ruled page. Runs the full height. */}
      <span
        className="pointer-events-none absolute inset-y-0 left-14 w-px"
        style={{ background: 'color-mix(in oklab, #201b18 12%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-md pt-8 pr-6 pb-28 pl-14">
        <div className="text-ash-dim absolute top-9 left-0 w-14 pr-4 text-right text-[0.68rem] leading-tight">
          Mon
          <br />
          <span className="text-ink-text text-base">10</span>
          <br />
          Aug
        </div>

        <header className="mb-8 pl-4">
          <span className="font-display text-lg tracking-tight">twoends</span>
        </header>

        <div className="pl-4">
          <p className="text-ash-dim mb-3 flex items-center gap-2 text-sm">
            <Avatar name={m.theirName} accent={m.theirAccent.onLight} size={22} />
            {m.theirName} answered first
          </p>

          <h1 className="font-display text-[1.75rem] leading-[1.28] tracking-tight italic">
            {m.question}
          </h1>

          <button
            className="mt-5 rounded-full px-6 py-3 text-base font-medium text-white"
            style={{ background: m.myAccent.onLight }}
          >
            Write yours
          </button>

          {/* Taped in, not laid out. */}
          <figure className="mt-10 mb-2 -rotate-2">
            <div className="bg-paper-raised inline-block rounded-[3px] p-2.5 pb-9 shadow-[0_6px_20px_rgba(32,27,24,0.16)]">
              <Snapshot seed={0} className="h-44 w-full rounded-[1px]" />
            </div>
            <figcaption className="font-display text-ash-dim -mt-7 ml-4 text-sm italic">
              waiting for the bus, 2h ago
            </figcaption>
          </figure>

          <p className="mt-10 text-[0.95rem] leading-relaxed">
            You have been together{' '}
            <span className="counter" style={{ color: m.theirAccent.onLight }}>
              {m.elapsed.days}
            </span>{' '}
            days, and {m.countdownTitle.toLowerCase()} in{' '}
            <span className="counter">{m.countdownDays}</span> more.
          </p>

          <div className="mt-8">
            <p className="text-ash-dim mb-2 text-sm">{m.streakLine}</p>
            <div className="flex gap-2.5" aria-label="This week">
              {m.week.map((mark, i) => (
                <span
                  key={WEEK_LABELS[i]}
                  className="grid h-7 w-7 place-items-center rounded-full text-[0.68rem]"
                  style={
                    mark === 'done'
                      ? { background: m.myAccent.onLight, color: '#FCFAF8' }
                      : mark === 'grace'
                        ? { border: `1px dashed ${m.theirAccent.onLight}`, color: ink }
                        : { border: '1px solid color-mix(in oklab, #201b18 14%, transparent)' }
                  }
                  title={mark === 'grace' ? 'Missed, and forgiven' : mark}
                >
                  {WEEK_LABELS[i]}
                </span>
              ))}
            </div>
          </div>

          <p className="text-ash-dim mt-10 text-sm">
            {m.myPlace} to {m.theirPlace} — {m.distanceKm.toLocaleString()} km
          </p>
        </div>
      </div>
    </div>
  );
}
