import { WEEK_LABELS, pad, useDesignModel } from './model.ts';
import { Faces, Scribble, Snapshot } from './parts.tsx';

/**
 * Bento — photo-led.
 *
 * The daily snap is the biggest object on the screen, because it is the thing
 * that changed today because of the other person. Tiles vary in size so the eye
 * has somewhere to land; a uniform grid of equal cards is what made the first
 * attempt read as a dashboard.
 *
 * Warm paper base, accents in their onLight variants.
 */
export function OptionBento() {
  const m = useDesignModel();

  return (
    <div className="bg-paper text-ink-text min-h-full" style={{ colorScheme: 'light' }}>
      <div className="mx-auto flex max-w-md flex-col gap-5 px-5 pt-6 pb-28">
        <header className="flex items-center justify-between">
          <span className="font-display text-xl tracking-tight">twoends</span>
          <span className="text-ash-dim text-xs">{m.myPlace}</span>
        </header>

        <Faces
          myName={m.myName}
          myAccent={m.myAccent.onLight}
          theirName={m.theirName}
          theirAccent={m.theirAccent.onLight}
          lineColor="#C9BDB2"
          middle={
            <span className="bg-paper-raised text-ash-dim relative rounded-full px-3 py-1 text-xs shadow-sm">
              {m.distanceKm.toLocaleString()} km
            </span>
          }
        />

        {/* Their move landed; yours has not. The one thing the screen is asking for. */}
        <section
          className="rounded-3xl p-5"
          style={{
            background: `color-mix(in oklab, ${m.theirAccent.onLight} 9%, #FCFAF8)`,
          }}
        >
          <p className="text-ash-dim mb-2 text-xs tracking-[0.18em] uppercase">
            {m.theirName} answered
          </p>
          <h1 className="font-display text-[1.6rem] leading-[1.2] tracking-tight">{m.question}</h1>
          <button
            className="mt-5 w-full rounded-full py-3.5 text-base font-medium text-white"
            style={{ background: m.myAccent.onLight }}
          >
            Write yours to see theirs
          </button>
        </section>

        <div className="grid grid-cols-2 gap-3">
          {/* The snap, deliberately the largest object on the page. */}
          <Snapshot seed={0} className="col-span-2 aspect-[4/3] rounded-3xl">
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/55 to-transparent p-4">
              <p className="text-sm text-white">Waiting for the bus</p>
              <p className="text-xs text-white/70">{m.theirName} · 2h</p>
            </div>
          </Snapshot>

          <div className="bg-paper-raised aspect-square rounded-3xl p-4 shadow-sm">
            <p className="text-ash-dim mb-1 text-xs">they drew</p>
            <Scribble color={m.theirAccent.onLight} className="h-[76%] w-full" />
          </div>

          <Snapshot seed={2} className="aspect-square rounded-3xl">
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent p-4">
              <p className="font-display text-3xl leading-none text-white">{m.countdownDays}</p>
              <p className="mt-1 text-xs leading-snug text-white/80">{m.countdownTitle}</p>
            </div>
          </Snapshot>
        </div>

        <section className="bg-paper-raised rounded-3xl px-5 py-4 shadow-sm">
          <p className="text-ash-dim text-xs">Together for</p>
          <p className="counter mt-1 text-2xl leading-none">
            {m.elapsed.days}
            <span className="text-ash-dim mx-1">:</span>
            {pad(m.elapsed.hours)}
            <span className="text-ash-dim mx-1">:</span>
            {pad(m.elapsed.minutes)}
            <span className="text-ash-dim mx-1">:</span>
            <span style={{ color: m.theirAccent.onLight }}>{pad(m.elapsed.seconds)}</span>
          </p>
          <div className="mt-4 flex items-center justify-between">
            {m.week.map((mark, i) => (
              <span
                key={WEEK_LABELS[i]}
                className="grid h-8 w-8 place-items-center rounded-full text-[0.7rem]"
                style={{
                  background:
                    mark === 'done'
                      ? m.myAccent.onLight
                      : 'color-mix(in oklab, #201b18 6%, transparent)',
                  color: mark === 'done' ? '#FCFAF8' : '#6b625b',
                  border: mark === 'grace' ? `1px dashed ${m.theirAccent.onLight}` : undefined,
                }}
                title={mark === 'grace' ? 'Missed, and forgiven' : mark}
              >
                {WEEK_LABELS[i]}
              </span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
