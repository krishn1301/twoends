import { WEEK_LABELS, pad, useDesignModel } from './model.ts';

/**
 * Option C — Cards, no seam.
 *
 * The two accents survive; the seam does not. Ownership is carried by a colour
 * rail on the edge of each card instead of by one diagonal across the screen.
 *
 * The honest case for it: it is the cheapest of the three to build and, more
 * importantly, the cheapest to *keep* building. Every new screen in Phases 4–9
 * has to answer "where does the seam go here?" — a card grid never asks. It is
 * also the most robust on a small old screen, which the S9+ is.
 *
 * The cost: this is what the category already looks like. Nothing here is
 * unmistakably ours.
 */
export function OptionC() {
  const m = useDesignModel();

  return (
    <div
      className="bg-ink text-chalk min-h-full"
      style={
        {
          '--mine': m.myAccent.onDark,
          '--theirs': m.theirAccent.onDark,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex max-w-md flex-col gap-4 px-5 pt-8 pb-28">
        <header className="mb-1 flex items-baseline justify-between">
          <span className="font-display text-lg tracking-tight">twoends</span>
          <span className="text-ash flex items-center gap-2 text-sm">
            <Dot color={m.myAccent.onDark} />
            {m.myName}
            <span className="text-hairline">·</span>
            <Dot color={m.theirAccent.onDark} />
            {m.theirName}
          </span>
        </header>

        <Card accent={m.theirAccent.onDark}>
          <p className="text-ash flex items-center gap-2 text-sm tracking-wide uppercase">
            <Dot color={m.theirAccent.onDark} />
            {m.turnLine}
          </p>
          <h1 className="font-display mt-2 text-2xl leading-tight tracking-tight">{m.question}</h1>
          <button
            className="text-ink mt-5 rounded-full px-6 py-3 text-base font-medium"
            style={{ background: m.myAccent.onDark }}
          >
            Answer
          </button>
        </Card>

        <Card>
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
        </Card>

        <Card accent={m.myAccent.onDark}>
          <p className="text-ash flex items-center gap-2 text-sm">
            <Dot color={m.myAccent.onDark} />
            {m.streakLine}
          </p>
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
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <p className="text-ash mb-2 text-xs leading-snug">{m.countdownTitle}</p>
            <p className="flex items-baseline">
              <span className="counter text-2xl">{m.countdownDays}</span>
              <span className="text-ash ml-1 text-sm">days</span>
            </p>
          </Card>
          <Card>
            <p className="text-ash mb-2 text-xs leading-snug">
              {m.myPlace} → {m.theirPlace}
            </p>
            <p className="flex items-baseline">
              <span className="counter text-2xl">{m.distanceKm.toLocaleString()}</span>
              <span className="text-ash ml-1 text-sm">km</span>
            </p>
          </Card>
        </div>
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

/**
 * `accent` marks whose card this is — the cue the seam would otherwise carry.
 *
 * It tints the card's own ground by a few percent rather than painting a thick
 * bar down one edge. A coloured edge rail is loud out of proportion to what it
 * says, and it is the single most templated-looking move in card UI. A tint
 * reads as "this surface belongs to someone" at a glance and survives being
 * next to five other cards; the dot in the card's eyebrow carries the same
 * information for anyone who cannot separate the tints.
 */
function Card({ accent, children }: { accent?: string; children: React.ReactNode }) {
  return (
    <div
      className="border-hairline bg-ink-raised overflow-hidden rounded-2xl border p-5"
      style={
        accent
          ? { background: `color-mix(in oklab, ${accent} 7%, var(--color-ink-raised))` }
          : undefined
      }
    >
      {children}
    </div>
  );
}
