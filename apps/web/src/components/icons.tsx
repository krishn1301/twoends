/**
 * SVG icons, not emoji.
 *
 * Both reference apps use emoji as illustration throughout — a flame for the
 * streak, a bouquet for the anniversary, a gift box on every card. It is cheap
 * and it renders differently on every platform, which is exactly the problem:
 * the Samsung emoji set on the S9+ does not match the Apple set in the App
 * Store screenshots. An icon that changes shape per device is not an identity.
 */

export function Flame({ color = 'currentColor' }: { color?: string }) {
  return (
    /*
      Drawn at 16px because that is the only size it is used at. An earlier
      version was a smooth teardrop and read unmistakably as a water drop on the
      device — a flame needs the leaning tip and the notched shoulder to survive
      being this small.
    */
    <svg width="15" height="17" viewBox="0 0 15 17" fill="none" aria-hidden="true">
      <path
        d="M9.4 0.4c.9 2.9-.4 4.3-2 5.8C5.4 8 3.2 9.4 3.2 11.8a4.8 4.8 0 0 0 9.6 0c0-1.7-.7-3-1.6-4.2-.2 1-.7 1.7-1.5 2.1.7-3 .5-6-.3-9.3Z"
        fill={color}
      />
      <path
        d="M5.6 11.4c0 1.3.8 2.3 2 2.7-1.9.3-3.4-.7-3.4-2.3 0-.9.4-1.7 1-2.4.1.8.2 1.4.4 2Z"
        fill={color}
        opacity="0.55"
      />
    </svg>
  );
}

export function Lock() {
  return (
    <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="6" width="9" height="7" rx="2" fill="currentColor" />
      <path
        d="M3.75 6V4.25a2.25 2.25 0 0 1 4.5 0V6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.2 12 4.5l8 6.7V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-7.8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 12.5c0 3.9-3.6 7-8 7a9 9 0 0 1-2.6-.4L4.5 20.5l1.2-3.4A6.7 6.7 0 0 1 4 12.5c0-3.9 3.6-7 8-7s8 3.1 8 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PairIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16.5" cy="10.5" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19.5c.6-2.7 2.8-4.2 5.5-4.2s4.9 1.5 5.5 4.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.8 15.5c2.1.2 3.4 1.5 3.9 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
