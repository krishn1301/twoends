import { WEEK_LABELS, pad, useDesignModel } from './model.ts';

/**
 * Option A — Night seam.
 *
 * Section 6 of the build plan, taken at its word: warm near-black, the two
 * accents washed across one soft diagonal, Fraunces for statements, Karla for
 * body, JetBrains Mono for anything that ticks. The seam leans toward whoever
 * the app is waiting on, so "your move" is the whole screen, not a button.
 */
export function OptionA() {
  const m = useDesignModel();

  return (
    <div
      className="seam seam-settles bg-ink text-chalk relative min-h-full"
      style={
        {
          '--mine': m.myAccent.onDark,
          '--theirs': m.theirAccent.onDark,
          '--seam-base': '#141110',
          '--chalk-ish': '#f2ede9',
          '--seam': m.seam,
        } as React.CSSProperties
      }
    >
      <div className="seam-line pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-md flex-col gap-9 px-6 pt-8 pb-28">
        <header className="flex items-baseline justify-between">
          <span className="font-display text-lg tracking-tight">twoends</span>
          <span className="text-ash flex items-center gap-2 text-sm">
            <Dot color={m.myAccent.onDark} />
            {m.myName}
            <span className="text-hairline">·</span>
            <Dot color={m.theirAccent.onDark} />
            {m.theirName}
          </span>
        </header>

        <section>
          <p className="text-ash text-sm tracking-wide uppercase">{m.turnLine}</p>
          <h1 className="font-display mt-3 text-[2rem] leading-[1.15] tracking-tight">
            {m.question}
          </h1>
          <button
            className="text-ink mt-6 rounded-full px-6 py-3 text-base font-medium"
            style={{ background: m.myAccent.onDark }}
          >
            Answer
          </button>
        </section>

        <section className="border-hairline border-t pt-6">
          <p className="text-ash text-sm">Together for</p>
          <p className="counter mt-2 text-[1.75rem] leading-none">
            <span>{m.elapsed.days}</span>
            <Sep />
            <span>{pad(m.elapsed.hours)}</span>
            <Sep />
            <span>{pad(m.elapsed.minutes)}</span>
            <Sep />
            <span style={{ color: m.theirAccent.onDark }}>{pad(m.elapsed.seconds)}</span>
          </p>
          <p className="text-ash mt-2 flex gap-6 text-[0.7rem] tracking-[0.2em] uppercase">
            <span>day</span>
            <span>hour</span>
            <span>min</span>
            <span>sec</span>
          </p>
        </section>

        <section className="border-hairline border-t pt-6">
          <p className="text-ash text-sm">{m.streakLine}</p>
          <div className="mt-3 flex justify-between">
            {m.week.map((mark, i) => (
              <div key={WEEK_LABELS[i]} className="flex flex-col items-center gap-2">
                <span className="text-ash text-[0.7rem]">{WEEK_LABELS[i]}</span>
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-xs"
                  style={{
                    background:
                      mark === 'done'
                        ? m.myAccent.onDark
                        : 'color-mix(in oklab, #f2ede9 8%, transparent)',
                    color: mark === 'done' ? '#141110' : '#8a817a',
                    border: mark === 'grace' ? `1px dashed ${m.theirAccent.onDark}` : undefined,
                  }}
                  title={mark === 'grace' ? 'Missed, and forgiven' : mark}
                >
                  {mark === 'done' ? '✓' : mark === 'grace' ? '·' : ''}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Tile label={m.countdownTitle}>
            <span className="counter text-2xl">{m.countdownDays}</span>
            <span className="text-ash ml-1 text-sm">days</span>
          </Tile>
          <Tile label={`${m.myPlace} → ${m.theirPlace}`}>
            <span className="counter text-2xl">{m.distanceKm.toLocaleString()}</span>
            <span className="text-ash ml-1 text-sm">km</span>
          </Tile>
        </section>
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full align-middle"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

function Sep() {
  return <span className="text-ash mx-1">:</span>;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-hairline bg-ink-raised/70 rounded-2xl border p-4">
      <p className="text-ash mb-2 text-xs leading-snug">{label}</p>
      <p className="flex items-baseline">{children}</p>
    </div>
  );
}
