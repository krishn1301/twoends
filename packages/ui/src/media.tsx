import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Faces, photographs and hand-made marks.
 *
 * These are the objects that make a screen read as "two people" instead of "a
 * dashboard". The first Phase 0 attempt was built from numbers, dots and
 * hairline rules and landed as a habit tracker; both reference apps put a face
 * or a photograph in front of you within the first 200px, every screen.
 *
 * The placeholders here are deliberately abstract — warm gradients with grain,
 * never stock photography — so nothing in a design review can be mistaken for a
 * finished asset. They are replaced by real media in Phase 5.
 */

/** Film grain, inline so the app never fetches a texture. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E\")";

const PHOTO_GRADIENTS = [
  'linear-gradient(155deg, #E8B48A 0%, #C97F6B 38%, #7C4A5A 78%, #33232E 100%)',
  'linear-gradient(200deg, #F0CFA8 0%, #D79B7E 44%, #8E5F63 100%)',
  'linear-gradient(140deg, #BFD3C4 0%, #86A392 40%, #3F514B 100%)',
  'linear-gradient(165deg, #F2C6C2 0%, #C98E9B 50%, #5E3E54 100%)',
] as const;

/**
 * A photograph that does not exist yet. `seed` keeps a given slot on the same
 * "photo" between renders — a placeholder that reshuffles every tick is
 * impossible to judge a layout against.
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
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: PHOTO_GRADIENTS[seed % PHOTO_GRADIENTS.length], ...style }}
      role="img"
      aria-label="Placeholder photo"
    >
      <span
        className="pointer-events-none absolute inset-0 mix-blend-overlay"
        style={{ backgroundImage: GRAIN }}
        aria-hidden="true"
      />
      {children}
    </div>
  );
}

/**
 * A face.
 *
 * The initial is a *fallback*, not a decoration: it shows when there is no
 * photograph, which is most of the time at first and is never treated as a
 * broken state — a coloured circle with a letter in it is a perfectly good way
 * to be recognised. When there is a photograph, the photograph is the whole
 * point and the letter gets out of the way.
 *
 * It also comes back if the image fails. Signed URLs expire, and an avatar that
 * silently becomes an empty coloured disc is worse than one that goes back to
 * saying who it is.
 */
export function Avatar({
  name,
  accent,
  size = 56,
  ring,
  src,
}: {
  name: string;
  accent: string;
  size?: number;
  ring?: string;
  /** A signed URL. Absent until they upload one. */
  src?: string | null;
}) {
  const [broken, setBroken] = useState(false);

  // A new URL deserves a fresh attempt — otherwise re-signing a link that had
  // expired leaves the avatar stuck on the initial until the screen remounts.
  useEffect(() => setBroken(false), [src]);

  const showPhoto = Boolean(src) && !broken;

  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(150deg, ${accent}, color-mix(in oklab, ${accent} 42%, #241A17))`,
        boxShadow: ring ? `0 0 0 2px ${ring}` : undefined,
        fontSize: size * 0.4,
      }}
      // `role` matters more now that the letter is conditional: an aria-label on
      // a bare span is not reliably announced, and with a photo showing there is
      // no longer any text inside to fall back on.
      role="img"
      aria-label={name}
    >
      {showPhoto && (
        <img
          src={src ?? undefined}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          // The accent circle stays underneath, so a slow load shows their
          // colour rather than a grey hole.
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
      {/*
        No grain layer here, deliberately. `mix-blend-overlay` promotes the child
        to its own stacking context, which escapes the parent's rounded clip in
        Chromium — on the S9+ that painted a black square around every avatar.
        At 30-60px the texture bought nothing anyway.
      */}
      {!showPhoto && (
        <span className="font-display relative leading-none font-semibold text-white/95">
          {name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

/**
 * The pair, drawn as a pair: two faces with the distance sitting on the line
 * between them.
 *
 * Both reference apps open with this and it is the one thing they get
 * unarguably right — it says "two people, this far apart" before you have read
 * a word. Ours differs in one respect that matters: the badge shows distance
 * only, never position, and it reads "off" rather than a number until both
 * partners have opted in. See docs/PRIVACY.md.
 */
export function Faces({
  myName,
  myAccent,
  mySrc,
  theirName,
  theirAccent,
  theirSrc,
  middle,
  size = 62,
  lineColor,
}: {
  myName: string;
  myAccent: string;
  mySrc?: string | null;
  theirName: string;
  theirAccent: string;
  theirSrc?: string | null;
  middle?: ReactNode;
  size?: number;
  lineColor: string;
}) {
  return (
    /*
      `items-start` rather than `items-center`, because each side is now a column
      — face on top, name underneath — and centring the columns would drag the
      dashed line and the distance badge down to the middle of the *column*
      instead of the middle of the two faces. The line has to meet the faces, or
      it stops reading as a line between two people.
    */
    <div className="flex items-start gap-3">
      <Named name={myName} accent={myAccent} size={size} src={mySrc} />
      {/* Exactly as tall as a face, so the badge sits on the faces' centre line. */}
      <div
        className="relative flex flex-1 items-center justify-center"
        style={{ height: size }}
      >
        <span
          className="absolute inset-x-0 top-1/2 border-t border-dashed"
          style={{ borderColor: lineColor }}
          aria-hidden="true"
        />
        {middle}
      </div>
      <Named name={theirName} accent={theirAccent} size={size} src={theirSrc} />
    </div>
  );
}

/**
 * A face with a name under it.
 *
 * The avatar alone falls back to a single initial, and two strangers' initials
 * are not a way to tell who is who — least of all when both people have chosen
 * a colour and neither has uploaded a photo yet. The name is the label; the
 * circle is the picture.
 *
 * Width is pinned to the avatar so a long name wraps or truncates instead of
 * pushing the dashed line off-centre, which would move the distance badge every
 * time somebody renamed themselves.
 */
function Named({
  name,
  accent,
  size,
  src,
}: {
  name: string;
  accent: string;
  size: number;
  src?: string | null;
}) {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5" style={{ width: size }}>
      <Avatar name={name} accent={accent} size={size} src={src} />
      <span
        className="w-full truncate text-center text-[0.7rem] leading-tight text-[#948A82]"
        title={name}
      >
        {name}
      </span>
    </div>
  );
}

/**
 * A drawing, as strokes rather than a bitmap — which is how the real canvas
 * stores them too, so the placeholder is structurally honest about the feature.
 */
export function Scribble({ color, className = '' }: { color: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} fill="none" aria-label="A drawing">
      <path
        d="M18 78 C 26 44, 44 30, 58 44 C 70 56, 52 74, 40 64 C 30 56, 44 34, 62 26"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M66 82 C 76 62, 88 52, 98 58 C 106 63, 98 76, 90 70"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.72"
      />
      <path d="M74 30 l6 -10 6 10 -6 5 z" fill={color} opacity="0.9" />
    </svg>
  );
}
