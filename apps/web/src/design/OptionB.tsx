import { WEEK_LABELS, pad, useDesignModel } from './model.ts';

/**
 * Option B — Paper seam.
 *
 * Same seam, same type, same content. Warm off-white base instead of near-black.
 *
 * The argument for it: every app in this category is a dark screen with a purple
 * gradient. A couple app that opens like a letter rather than a nightclub is
 * instantly distinguishable, and warm paper flatters photographs — which is what
 * snaps, countdowns and the journal are mostly made of.
 *
 * The argument against: widgets sit on wallpapers, most of which are dark, and a
 * bright widget is the one nobody keeps. Worth seeing before deciding.
 *
 * Accents switch to their `onLight` variants here. No mid-tone colour can clear
 * 4.5:1 against both a near-black and a near-white ground — see @twoends/core.
 */
export function OptionB() {
  const m = useDesignModel();

  return (
    <div
      className="seam seam-settles bg-paper text-ink-text relative min-h-full"
      style={
        {
          '--mine': m.myAccent.onLight,
          '--theirs': m.theirAccent.onLight,
          '--seam-base': '#f4efea',
          '--chalk-ish': '#201b18',
          '--seam': m.seam,
          colorScheme: 'light',
        } as React.CSSProperties
      }
    >
      <div className="seam-line pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-md flex-col gap-9 px-6 pt-8 pb-28">
        <header className="flex items-baseline justify-between">
          <span className="font-display text-lg tracking-tight">twoends</span>
          <span className="text-ash-dim flex items-center gap-2 text-sm">
            <Dot color={m.myAccent.onLight} />
            {m.myName}
            <span className="text-paper-hairline">·</span>
            <Dot color={m.theirAccent.onLight} />
            {m.theirName}
          </span>
        </header>

        <section>
          <p className="text-ash-dim text-sm tracking-wide uppercase">{m.turnLine}</p>
          <h1 className="font-display mt-3 text-[2rem] leading-[1.15] tracking-tight">
            {m.question}
          </h1>
          <button
            className="text-paper-raised mt-6 rounded-full px-6 py-3 text-base font-medium"
            style={{ background: m.myAccent.onLight }}
          >
            Answer
          </button>
        </section>

        <section className="border-paper-hairline border-t pt-6">
          <p className="text-ash-dim text-sm">Together for</p>
          <p className="counter mt-2 text-[1.75rem] leading-none">
            <span>{m.elapsed.days}</span>
            <Sep />
            <span>{pad(m.elapsed.hours)}</span>
            <Sep />
            <span>{pad(m.elapsed.minutes)}</span>
            <Sep />
            <span style={{ color: m.theirAccent.onLight }}>{pad(m.elapsed.seconds)}</span>
          </p>
          <p className="text-ash-dim mt-2 flex gap-6 text-[0.7rem] tracking-[0.2em] uppercase">
            <span>day</span>
            <span>hour</span>
            <span>min</span>
            <span>sec</span>
          </p>
        </section>

        <section className="border-paper-hairline border-t pt-6">
          <p className="text-ash-dim text-sm">{m.streakLine}</p>
          <div className="mt-3 flex justify-between">
            {m.week.map((mark, i) => (
              <div key={WEEK_LABELS[i]} className="flex flex-col items-center gap-2">
                <span className="text-ash-dim text-[0.7rem]">{WEEK_LABELS[i]}</span>
                <span
                  className="grid h-9 w-9 place-items-center rounded-full text-xs"
                  style={{
                    background:
                      mark === 'done'
                        ? m.myAccent.onLight
                        : 'color-mix(in oklab, #201b18 7%, transparent)',
                    color: mark === 'done' ? '#fcfaf8' : '#6b625b',
                    border: mark === 'grace' ? `1px dashed ${m.theirAccent.onLight}` : undefined,
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
            <span className="text-ash-dim ml-1 text-sm">days</span>
          </Tile>
          <Tile label={`${m.myPlace} → ${m.theirPlace}`}>
            <span className="counter text-2xl">{m.distanceKm.toLocaleString()}</span>
            <span className="text-ash-dim ml-1 text-sm">km</span>
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
  return <span className="text-ash-dim mx-1">:</span>;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-paper-hairline bg-paper-raised/80 rounded-2xl border p-4">
      <p className="text-ash-dim mb-2 text-xs leading-snug">{label}</p>
      <p className="flex items-baseline">{children}</p>
    </div>
  );
}
