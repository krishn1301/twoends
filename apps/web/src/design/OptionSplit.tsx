import { WEEK_LABELS, pad, useDesignModel } from './model.ts';
import { Avatar, Scribble, Snapshot } from './parts.tsx';

/**
 * Split — the name, made literal.
 *
 * Two ends. Their column and yours, divided by the seam, each holding what that
 * person has actually put there today. Their side is full; yours is an empty
 * slot with your colour around it. The asymmetry *is* the "your move" state, so
 * the screen never needs a nagging banner to say so.
 *
 * The bet: a couple opens this and instantly sees who has shown up today,
 * without reading anything. The risk: it hard-codes a two-column structure that
 * every later screen has to either honour or break.
 */
export function OptionSplit() {
  const m = useDesignModel();

  return (
    <div className="bg-paper text-ink-text min-h-full" style={{ colorScheme: 'light' }}>
      <div className="mx-auto max-w-md px-5 pt-6 pb-28">
        <header className="mb-6 flex items-center justify-between">
          <span className="font-display text-xl tracking-tight">twoends</span>
          <span className="text-ash-dim text-xs">{m.distanceKm.toLocaleString()} km apart</span>
        </header>

        <section className="relative">
          {/* The seam: one soft diagonal down the middle, tinted to each side. */}
          <span
            className="pointer-events-none absolute inset-0 rounded-[28px]"
            style={{
              background: `linear-gradient(168deg,
                color-mix(in oklab, ${m.myAccent.onLight} 13%, #F4EFEA) 0%,
                color-mix(in oklab, ${m.myAccent.onLight} 13%, #F4EFEA) 38%,
                color-mix(in oklab, ${m.theirAccent.onLight} 13%, #F4EFEA) 62%,
                color-mix(in oklab, ${m.theirAccent.onLight} 13%, #F4EFEA) 100%)`,
            }}
            aria-hidden="true"
          />

          <div className="relative grid grid-cols-2 gap-3 p-3">
            {/* Your end — empty, and the emptiness is the prompt. */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Avatar name={m.myName} accent={m.myAccent.onLight} size={30} />
                <span className="text-sm font-medium">You</span>
              </div>
              <button
                className="grid aspect-[3/4] w-full place-items-center rounded-2xl text-sm"
                style={{
                  border: `1.5px dashed ${m.myAccent.onLight}`,
                  color: m.myAccent.onLight,
                  background: 'color-mix(in oklab, #FCFAF8 55%, transparent)',
                }}
              >
                Add today&rsquo;s snap
              </button>
              <div
                className="grid aspect-square w-full place-items-center rounded-2xl text-xs"
                style={{
                  border: `1.5px dashed ${m.myAccent.onLight}`,
                  color: m.myAccent.onLight,
                }}
              >
                Draw
              </div>
            </div>

            {/* Their end — full. */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-end gap-2">
                <span className="text-sm font-medium">{m.theirName}</span>
                <Avatar name={m.theirName} accent={m.theirAccent.onLight} size={30} />
              </div>
              <Snapshot seed={0} className="aspect-[3/4] w-full rounded-2xl">
                <p className="absolute right-0 bottom-0 left-0 bg-gradient-to-t from-black/55 to-transparent p-2.5 text-[0.7rem] text-white">
                  waiting for the bus
                </p>
              </Snapshot>
              <div className="bg-paper-raised grid aspect-square w-full place-items-center rounded-2xl p-2">
                <Scribble color={m.theirAccent.onLight} className="h-full w-full" />
              </div>
            </div>
          </div>
        </section>

        <section
          className="mt-4 rounded-3xl p-5"
          style={{ background: `color-mix(in oklab, ${m.theirAccent.onLight} 8%, #FCFAF8)` }}
        >
          <p className="text-ash-dim mb-2 text-xs tracking-[0.18em] uppercase">
            {m.theirName} answered
          </p>
          <h1 className="font-display text-[1.5rem] leading-[1.2] tracking-tight">{m.question}</h1>
          <button
            className="mt-4 w-full rounded-full py-3.5 text-base font-medium text-white"
            style={{ background: m.myAccent.onLight }}
          >
            Write yours to see theirs
          </button>
        </section>

        <section className="mt-4 flex items-end justify-between px-1">
          <div>
            <p className="text-ash-dim text-xs">Together for</p>
            <p className="counter mt-1 text-xl leading-none">
              {m.elapsed.days}
              <span className="text-ash-dim mx-0.5">:</span>
              {pad(m.elapsed.hours)}
              <span className="text-ash-dim mx-0.5">:</span>
              {pad(m.elapsed.minutes)}
              <span className="text-ash-dim mx-0.5">:</span>
              <span style={{ color: m.theirAccent.onLight }}>{pad(m.elapsed.seconds)}</span>
            </p>
          </div>
          <div className="flex gap-1.5">
            {m.week.map((mark, i) => (
              <span
                key={WEEK_LABELS[i]}
                className="h-2.5 w-2.5 rounded-full"
                style={
                  mark === 'done'
                    ? { background: m.myAccent.onLight }
                    : mark === 'grace'
                      ? { border: `1px dashed ${m.theirAccent.onLight}` }
                      : { background: 'color-mix(in oklab, #201b18 12%, transparent)' }
                }
                title={`${WEEK_LABELS[i]}: ${mark === 'grace' ? 'missed, forgiven' : mark}`}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
