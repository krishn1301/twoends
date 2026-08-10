import type { CSSProperties, ReactNode } from 'react';

/**
 * Shared primitives for the paper-based design candidates.
 *
 * The first round of shells failed for one reason: they were made of numbers,
 * dots and hairline rules, which is what a habit tracker is made of. The
 * reference apps are made of *faces, photographs and hand-made marks* — two
 * avatars joined by a dashed line, a scribbled bouquet, a snapshot with a
 * caption. That is what reads as "two people" rather than "a dashboard".
 *
 * These placeholders stand in for real content. They are deliberately abstract:
 * warm gradients with grain, not stock photos, so nothing here can be mistaken
 * for a finished asset.
 */

/** Film grain, inline so nothing is fetched. Sits over photo placeholders. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.32'/%3E%3C/svg%3E\")";

const PHOTO_GRADIENTS = [
  'linear-gradient(155deg, #E8B48A 0%, #C97F6B 38%, #7C4A5A 78%, #3D2B38 100%)',
  'linear-gradient(200deg, #F0CFA8 0%, #D79B7E 44%, #8E5F63 100%)',
  'linear-gradient(140deg, #BFD3C4 0%, #86A392 40%, #4A5D57 100%)',
  'linear-gradient(165deg, #F2C6C2 0%, #C98E9B 50%, #6E4A63 100%)',
] as const;

/**
 * A photograph that does not exist yet.
 *
 * `seed` picks a gradient so the same slot keeps the same "photo" across
 * re-renders — a placeholder that reshuffles every tick is impossible to judge
 * a layout against.
 */
export function Snapshot({
  seed = 0,
  className = '',
  style,
  children,
}: {
  seed?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const gradient = PHOTO_GRADIENTS[seed % PHOTO_GRADIENTS.length];
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: gradient, ...style }}
      role="img"
      aria-label="Placeholder photo"
    >
      <div
        className="pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

/** A face that does not exist yet. Initial on a warm gradient, in their accent. */
export function Avatar({
  name,
  accent,
  size = 56,
  ring,
}: {
  name: string;
  accent: string;
  size?: number;
  ring?: string;
}) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, ${accent}, color-mix(in oklab, ${accent} 45%, #2A1F1C))`,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
        fontSize: size * 0.38,
      }}
      aria-label={name}
    >
      <span
        className="pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
        aria-hidden="true"
      />
      <span className="font-display relative font-semibold text-white/95">{name.slice(0, 1)}</span>
    </span>
  );
}

/**
 * The pair, drawn as a pair: two faces with the distance sitting on the line
 * between them. Lifted straight from the reference apps because it is the one
 * thing they get unarguably right — it says "two people, this far apart" before
 * you have read a single word.
 */
export function Faces({
  myName,
  myAccent,
  theirName,
  theirAccent,
  middle,
  size = 60,
  lineColor,
}: {
  myName: string;
  myAccent: string;
  theirName: string;
  theirAccent: string;
  middle?: ReactNode;
  size?: number;
  lineColor: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={myName} accent={myAccent} size={size} />
      <div className="relative flex flex-1 items-center justify-center">
        <span
          className="absolute inset-x-0 top-1/2 border-t border-dashed"
          style={{ borderColor: lineColor }}
          aria-hidden="true"
        />
        {middle}
      </div>
      <Avatar name={theirName} accent={theirAccent} size={size} />
    </div>
  );
}

/**
 * A drawing, as strokes rather than a bitmap — which is also how the real canvas
 * stores them, so this placeholder is structurally honest about the feature.
 */
export function Scribble({ color, className = '' }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} fill="none" aria-label="A drawing">
      <path
        d="M18 78 C 26 44, 44 30, 58 44 C 70 56, 52 74, 40 64 C 30 56, 44 34, 62 26"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M66 82 C 76 62, 88 52, 98 58 C 106 63, 98 76, 90 70"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path d="M74 30 l6 -10 6 10 -6 5 z" fill={color} opacity="0.9" />
    </svg>
  );
}
