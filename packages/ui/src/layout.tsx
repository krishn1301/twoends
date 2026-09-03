import type { CSSProperties, ReactNode } from 'react';

/**
 * The structural language, derived from what the reference apps actually do.
 *
 * Both of them build every screen the same way: a titled section, an optional
 * "see all" on the right, and a horizontally scrolling rail of square cards
 * underneath with the next card peeking at the edge. It works because it makes
 * a long feature list browsable without a settings screen, and because the peek
 * tells you there is more without a scrollbar.
 *
 * What we do differently, deliberately: their card colours are an arbitrary
 * rainbow — magenta, purple, teal, orange, unrelated to anything. Ours are
 * derived from the two partners' accents, so the palette of the app *is* the
 * couple. Same structure, and the colour actually carries meaning.
 */

/** A titled block. `action` is the "see all" affordance on the right. */
export function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-5">
        <h2 className="text-[1.35rem] leading-none font-bold tracking-[-0.01em]">{title}</h2>
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="text-ash -mr-2 flex items-center gap-1 px-2 text-[0.95rem] font-medium"
          >
            {action}
            <Chevron />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * A horizontal rail. Cards keep their width and the row scrolls, with the next
 * card deliberately peeking past the right edge.
 *
 * `snap-x` plus per-item `snap-start` means a flick lands on a card rather than
 * halfway between two, which is the difference between this feeling like an app
 * and feeling like a web page.
 */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

/**
 * The card. Lowercase eyebrow, serif headline, optional badge — the anatomy
 * both reference apps use, because at a glance the eyebrow says *what kind of
 * thing this is* and the headline says what it would do for you.
 *
 * `ground` is a colour or gradient; pass `bare` when the child is a photograph
 * that should reach every edge.
 */
export function Tile({
  eyebrow,
  headline,
  footnote,
  ground,
  badge,
  wide,
  onDark = true,
  onAccent = false,
  onClick,
  children,
  style,
}: {
  eyebrow?: string;
  headline?: string;
  /**
   * A quiet third line under the headline, for the caveat a number needs to be
   * honest — how old a reading is, say. Clipped to one line: a card that grows
   * to fit a caveat breaks the fixed height the whole rail depends on.
   */
  footnote?: string;
  ground?: string;
  badge?: ReactNode;
  /** Two columns wide instead of one. */
  wide?: boolean;
  /** False when the ground is light enough to need dark text. */
  onDark?: boolean;
  /**
   * True when `ground` is a full-strength accent or a gradient across both.
   *
   * **Item 4 of the visual review.** There were two ground cases here and the
   * liveliest card in the app needed a third. The accents are engineered
   * against black and there is a test asserting it; nothing ever covered text
   * placed *on top* of one. Measured on the anniversary card's rose-to-iris
   * gradient, the "DAY / HR / MIN / SEC" row came out at 2.7:1 and the
   * "anniversary" eyebrow at 2.3:1 — and on the lighter half of the picker,
   * teal, citron, amber and moss, the same labels land at 1.6-1.9:1, which is
   * close to invisible.
   *
   * The fix is a scrim under the label zone rather than a per-accent label
   * colour, because `ground` can be a gradient and there is no single colour to
   * measure against. At 0.5-0.62 black the worst case in the palette — white on
   * citron — goes from 2.03:1 to about 7:1, and every other accent is further
   * clear. It is one rule that cannot be wrong for a particular pair, which a
   * table of twelve hand-picked label colours could very easily be.
   *
   * Passed by the call site rather than read from the design version, because
   * this package may not know the app exists.
   */
  onAccent?: boolean;
  /** Makes the whole card a button. Cards that do nothing take no handler. */
  onClick?: () => void;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  /*
    Fixed height, not `aspect-square`.
    `aspect-ratio` is only a hint — content taller than the box wins, so on the
    S9+ every tile grew to a different height and the headlines spilled past the
    rounded corners. A fixed height plus an absolutely positioned footer means a
    rail always reads as one straight row, whatever the copy does.
  */
  /*
    A real <button> when it does something, so it is reachable by keyboard and
    announced as actionable. `text-left` because a button centres its content by
    default and these are cards, not labels.
  */
  const Element = onClick ? 'button' : 'article';

  return (
    <Element
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`lift relative h-44 shrink-0 snap-start overflow-hidden rounded-[28px] text-left ${wide ? 'w-[76vw] max-w-[19rem]' : 'w-[44vw] max-w-[10.5rem]'}`}
      style={{ background: ground ?? 'var(--color-surface)', ...style }}
    >
      <div className="absolute inset-0">{children}</div>

      {badge && <div className="absolute top-3.5 left-3.5 z-10">{badge}</div>}

      {onAccent && (eyebrow ?? headline ?? footnote) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-1/2"
          style={{
            background:
              'linear-gradient(to top, rgb(0 0 0 / 0.62) 0%, rgb(0 0 0 / 0.5) 45%, rgb(0 0 0 / 0) 100%)',
          }}
        />
      )}

      {(eyebrow ?? headline ?? footnote) && (
        <div className="absolute inset-x-0 bottom-0 z-10 p-3.5">
          {eyebrow && (
            <p
              className="mb-1 text-[0.78rem] leading-none"
              style={{ color: labelColour(onDark, onAccent, 'eyebrow') }}
            >
              {eyebrow}
            </p>
          )}
          {headline && (
            <p
              className="font-display line-clamp-2 text-[1.1rem] leading-[1.16] font-semibold tracking-[-0.01em]"
              style={{ color: labelColour(onDark, onAccent, 'headline') }}
            >
              {headline}
            </p>
          )}
          {footnote && (
            <p
              className="mt-1 truncate text-[0.68rem] leading-none"
              style={{ color: labelColour(onDark, onAccent, 'footnote') }}
            >
              {footnote}
            </p>
          )}
        </div>
      )}
    </Element>
  );
}

/**
 * The three label colours, in one place so the scrim and the alphas it was
 * measured against cannot drift apart.
 *
 * On an accent the translucency comes right down: the whole reason the labels
 * were faint is that a hairline of white at 60% is what an eyebrow wants on
 * *black*, and nobody re-checked it when the ground became a colour.
 */
function labelColour(
  onDark: boolean,
  onAccent: boolean,
  part: 'eyebrow' | 'headline' | 'footnote',
): string {
  if (!onDark) {
    return part === 'headline'
      ? '#141110'
      : part === 'eyebrow'
        ? 'rgba(0,0,0,0.55)'
        : 'rgba(0,0,0,0.42)';
  }
  if (onAccent) {
    return part === 'headline'
      ? '#FFFFFF'
      : part === 'eyebrow'
        ? 'rgba(255,255,255,0.86)'
        : 'rgba(255,255,255,0.74)';
  }
  return part === 'headline'
    ? '#FFFFFF'
    : part === 'eyebrow'
      ? 'rgba(255,255,255,0.6)'
      : 'rgba(255,255,255,0.45)';
}

/** Translucent pill, for "new", a lock, or a streak count. */
export function Pill({
  children,
  tone = 'light',
}: {
  children: ReactNode;
  tone?: 'light' | 'dark';
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.78rem] font-medium"
      style={
        tone === 'light'
          ? { background: 'rgba(255,255,255,0.18)', color: '#FFFFFF' }
          : { background: 'rgba(0,0,0,0.42)', color: '#FFFFFF' }
      }
    >
      {children}
    </span>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 3.5 L10.5 8 L6 12.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
